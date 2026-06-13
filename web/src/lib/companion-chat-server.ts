// B386 (M26) — серверная оркестрация чат-компаньона: БД + биллинг сеансами +
// AI с предохранителями. Безопасность критична: кризис никогда не гейтится
// оплатой; списания баллов идут через clarity-credit-ledger (транзакционно).

import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import db from "@/lib/db";
import { classifyDialogueSafety, shouldInterruptDialogue } from "@/lib/dialogue-safety";
import { spendClarityCreditsForProduct } from "@/lib/clarity-credits";
import { getUserActivePlan } from "@/lib/entitlements";
import { log, serializeError } from "@/lib/logger";
import {
  buildCompanionSystemPrompt,
  companionSafeguard,
  sanitizeCompanionReply,
  splitIntoMessages,
  typingDelayMs,
  isCompanionMode,
  COMPANION_CRISIS_TEXT,
  type CompanionMode,
} from "@/lib/companion-chat";
import {
  CHAT_EXTENSION_PRODUCT_KEY,
  CHAT_SESSION_COST_CREDITS,
  CHAT_SESSION_PRICE_KOPECKS,
  CHAT_SESSION_PRODUCT_KEY,
  canUsePremiumIncludedSession,
  decideChatSend,
  freeMessagesRemaining,
  isPaidSessionActive,
  paidMinutesRemaining,
  premiumIncludedRemaining,
  sessionWindowOnExtend,
  sessionWindowOnStart,
  startOfMonth,
  type ChatSessionState,
} from "@/lib/chat-session";

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 24; // ограничиваем контекст AI

export type CompanionMessage = { role: "user" | "companion"; text: string; at: string };

type SessionRow = {
  id: string;
  userId: string;
  mode: string;
  status: string;
  freeMessagesUsed: number;
  paidStartedAt: Date | null;
  paidExpiresAt: Date | null;
  premiumIncluded: boolean;
  messages: Prisma.JsonValue;
};

function toMessages(value: Prisma.JsonValue): CompanionMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is CompanionMessage =>
      !!m && typeof m === "object" && typeof (m as CompanionMessage).text === "string",
  );
}

function toState(row: SessionRow): ChatSessionState {
  return {
    freeMessagesUsed: row.freeMessagesUsed,
    paidStartedAt: row.paidStartedAt,
    paidExpiresAt: row.paidExpiresAt,
  };
}

export type PublicSessionState = {
  id: string;
  mode: CompanionMode;
  messages: CompanionMessage[];
  freeRemaining: number;
  paidActive: boolean;
  minutesRemaining: number;
  cost: { credits: number; kopecks: number };
};

function publicState(row: SessionRow, now = new Date()): PublicSessionState {
  return {
    id: row.id,
    mode: isCompanionMode(row.mode) ? row.mode : "explore",
    messages: toMessages(row.messages),
    freeRemaining: freeMessagesRemaining(row.freeMessagesUsed),
    paidActive: isPaidSessionActive(toState(row), now),
    minutesRemaining: paidMinutesRemaining(toState(row), now),
    cost: { credits: CHAT_SESSION_COST_CREDITS, kopecks: CHAT_SESSION_PRICE_KOPECKS },
  };
}

export async function getOrCreateSession(input: {
  userId: string;
  sourceDialogueId?: string | null;
  mode?: string | null;
}): Promise<SessionRow> {
  const mode = isCompanionMode(input.mode) ? input.mode : "explore";
  const existing = await db.companionChatSession.findFirst({
    where: { userId: input.userId },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing as SessionRow;
  const created = await db.companionChatSession.create({
    data: {
      userId: input.userId,
      sourceDialogueId: input.sourceDialogueId ?? null,
      mode,
    },
  });
  return created as SessionRow;
}

async function loadSession(userId: string, sessionId: string): Promise<SessionRow | null> {
  const row = await db.companionChatSession.findFirst({ where: { id: sessionId, userId } });
  return (row as SessionRow) ?? null;
}

export type SendResult =
  | { kind: "crisis"; reply: string[]; typingMs: number[]; offerSpecialist: true; state: PublicSessionState }
  | { kind: "deflect"; reply: string[]; typingMs: number[]; state: PublicSessionState }
  | { kind: "paywalled"; cost: { credits: number; kopecks: number }; state: PublicSessionState }
  | { kind: "reply"; reply: string[]; typingMs: number[]; state: PublicSessionState };

async function appendAndUpdate(
  row: SessionRow,
  appended: CompanionMessage[],
  patch: Prisma.CompanionChatSessionUpdateInput,
): Promise<SessionRow> {
  const messages = [...toMessages(row.messages), ...appended].slice(-200);
  const updated = await db.companionChatSession.update({
    where: { id: row.id },
    data: { ...patch, messages: messages as unknown as Prisma.InputJsonValue },
  });
  return updated as SessionRow;
}

// Отправка сообщения: предохранители → AI-классификатор безопасности → биллинг-гейт
// → генерация. Кризис и «ты бот?» обрабатываются ДО гейта и не гейтятся оплатой.
export async function sendCompanionMessage(input: {
  userId: string;
  sessionId: string;
  text: string;
  mode?: string | null;
  requestId?: string;
}): Promise<SendResult | { kind: "not_found" }> {
  const row = await loadSession(input.userId, input.sessionId);
  if (!row) return { kind: "not_found" };

  const text = (input.text ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!text) {
    return { kind: "reply", reply: [], typingMs: [], state: publicState(row) };
  }
  const mode = isCompanionMode(input.mode) ? input.mode : (isCompanionMode(row.mode) ? row.mode : "explore");
  const now = new Date();
  const userMsg: CompanionMessage = { role: "user", text, at: now.toISOString() };

  // 1. Быстрый предохранитель (эвристика). Кризис — только safety-сообщение.
  const guard = companionSafeguard(text);
  if (guard.action === "crisis") {
    const updated = await appendAndUpdate(row, [userMsg, { role: "companion", text: guard.reply, at: now.toISOString() }], { mode });
    return { kind: "crisis", reply: [guard.reply], typingMs: [typingDelayMs(guard.reply)], offerSpecialist: true, state: publicState(updated, now) };
  }

  // 2. AI-классификатор безопасности (ловит тонкие случаи помимо эвристики).
  try {
    const safety = await classifyDialogueSafety({ question: text, userId: input.userId, requestId: input.requestId });
    if (shouldInterruptDialogue(safety.level)) {
      const updated = await appendAndUpdate(row, [userMsg, { role: "companion", text: COMPANION_CRISIS_TEXT, at: now.toISOString() }], { mode });
      return { kind: "crisis", reply: [COMPANION_CRISIS_TEXT], typingMs: [typingDelayMs(COMPANION_CRISIS_TEXT)], offerSpecialist: true, state: publicState(updated, now) };
    }
  } catch (error) {
    log.warn("companion-chat-safety-skip", { requestId: input.requestId, error: serializeError(error) });
    // консервативно продолжаем только если эвристика была "continue"
  }

  // 3. «Ты бот?» → мягкий уход (без AI, без списания).
  if (guard.action === "deflect") {
    const updated = await appendAndUpdate(row, [userMsg, { role: "companion", text: guard.reply, at: now.toISOString() }], { mode });
    return { kind: "deflect", reply: [guard.reply], typingMs: [typingDelayMs(guard.reply)], state: publicState(updated, now) };
  }

  // 4. Биллинг-гейт: бесплатные сообщения ИЛИ активный оплаченный сеанс.
  const decision = decideChatSend(toState(row), now);
  if (!decision.allowed) {
    return { kind: "paywalled", cost: decision.cost, state: publicState(row, now) };
  }

  // 5. Генерация ответа компаньона.
  const reply = await generateCompanionReply({ history: toMessages(row.messages), text, mode, userId: input.userId, requestId: input.requestId });
  const chunks = splitIntoMessages(reply);
  const safeChunks = chunks.length > 0 ? chunks : [sanitizeCompanionReply("")];
  const companionMsgs: CompanionMessage[] = safeChunks.map((c) => ({ role: "companion", text: c, at: new Date().toISOString() }));

  const updated = await appendAndUpdate(row, [userMsg, ...companionMsgs], {
    mode,
    freeMessagesUsed: decision.kind === "free" ? { increment: 1 } : undefined,
  });

  return { kind: "reply", reply: safeChunks, typingMs: safeChunks.map(typingDelayMs), state: publicState(updated, now) };
}

async function generateCompanionReply(input: {
  history: CompanionMessage[];
  text: string;
  mode: CompanionMode;
  userId: string;
  requestId?: string;
}): Promise<string> {
  try {
    const recent = input.history.slice(-MAX_HISTORY_MESSAGES);
    const response = await aiComplete({
      feature: "companion-chat",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 320,
      temperature: 0.6,
      messages: [
        { role: "system", content: buildCompanionSystemPrompt(input.mode) },
        ...recent.map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.text })),
        { role: "user", content: input.text },
      ],
    });
    return sanitizeCompanionReply(response.text);
  } catch (error) {
    log.warn("companion-chat-fallback", { requestId: input.requestId, error: serializeError(error) });
    return "Я рядом. Расскажите чуть больше — что в этой ситуации беспокоит вас сильнее всего?";
  }
}

export type StartSessionResult =
  | { ok: true; includedByPremium: boolean; state: PublicSessionState }
  | { ok: false; reason: "insufficient_credits" | "not_found" | "needs_active_session" };

// Старт оплаченного сеанса: сперва квота Premium (2/мес), иначе списание 4 баллов.
export async function startPaidSession(input: { userId: string; sessionId: string }): Promise<StartSessionResult> {
  const row = await loadSession(input.userId, input.sessionId);
  if (!row) return { ok: false, reason: "not_found" };
  const now = new Date();
  // Защита от двойного списания: если оплаченный сеанс уже активен — не списываем
  // повторно, просто возвращаем текущее состояние.
  if (isPaidSessionActive(toState(row), now)) {
    return { ok: true, includedByPremium: row.premiumIncluded, state: publicState(row, now) };
  }
  const window = sessionWindowOnStart(now);

  const plan = await getUserActivePlan(input.userId);
  const isPremium = plan?.key === "premium";
  if (isPremium) {
    const includedUsedThisMonth = await db.companionChatSession.count({
      where: { userId: input.userId, premiumIncluded: true, paidStartedAt: { gte: startOfMonth(now) } },
    });
    if (canUsePremiumIncludedSession({ isPremium, includedUsedThisMonth })) {
      const updated = await db.companionChatSession.update({
        where: { id: row.id },
        data: { premiumIncluded: true, paidStartedAt: window.startedAt, paidExpiresAt: window.expiresAt, status: "active" },
      });
      return { ok: true, includedByPremium: true, state: publicState(updated as SessionRow, now) };
    }
  }

  try {
    await spendClarityCreditsForProduct({
      userId: input.userId,
      productKey: CHAT_SESSION_PRODUCT_KEY,
      sourceEventId: `chat-session:${row.id}:${now.getTime()}`,
      metadata: { sessionId: row.id, kind: "session_start" },
    });
  } catch {
    return { ok: false, reason: "insufficient_credits" };
  }

  const updated = await db.companionChatSession.update({
    where: { id: row.id },
    data: { premiumIncluded: false, paidStartedAt: window.startedAt, paidExpiresAt: window.expiresAt, status: "active" },
  });
  return { ok: true, includedByPremium: false, state: publicState(updated as SessionRow, now) };
}

// Продление активного сеанса на +30 мин за 2 балла.
export async function extendPaidSession(input: { userId: string; sessionId: string }): Promise<StartSessionResult> {
  const row = await loadSession(input.userId, input.sessionId);
  if (!row) return { ok: false, reason: "not_found" };
  const now = new Date();
  // Продление возможно только при активном оплаченном сеансе — иначе это был бы
  // способ получить 30 минут за 2 балла в обход полноценного старта (4 балла).
  if (!isPaidSessionActive(toState(row), now)) {
    return { ok: false, reason: "needs_active_session" };
  }

  try {
    await spendClarityCreditsForProduct({
      userId: input.userId,
      productKey: CHAT_EXTENSION_PRODUCT_KEY,
      sourceEventId: `chat-extension:${row.id}:${now.getTime()}`,
      metadata: { sessionId: row.id, kind: "session_extend" },
    });
  } catch {
    return { ok: false, reason: "insufficient_credits" };
  }

  const { expiresAt } = sessionWindowOnExtend(toState(row), now);
  const updated = await db.companionChatSession.update({
    where: { id: row.id },
    data: { paidExpiresAt: expiresAt, status: "active" },
  });
  return { ok: true, includedByPremium: row.premiumIncluded, state: publicState(updated as SessionRow, now) };
}

export async function getSessionState(input: { userId: string; sessionId?: string | null; sourceDialogueId?: string | null }): Promise<PublicSessionState> {
  const row = input.sessionId
    ? await loadSession(input.userId, input.sessionId)
    : null;
  const session = row ?? (await getOrCreateSession({ userId: input.userId, sourceDialogueId: input.sourceDialogueId }));
  return publicState(session);
}

export { premiumIncludedRemaining };
