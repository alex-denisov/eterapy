// B386 (M26) — серверная оркестрация чат-компаньона: БД + биллинг сеансами +
// AI с предохранителями. Безопасность критична: кризис никогда не гейтится
// оплатой; списания баллов идут через clarity-credit-ledger (транзакционно).

import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import db from "@/lib/db";
import { tryParseChatAnalysis } from "@/lib/chat-analysis";
import { stripDeepeningSection } from "@/lib/dialogue-answer-format";
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
  isWithinExtendGrace,
  paidMinutesRemaining,
  premiumIncludedRemaining,
  sessionWindowOnExtend,
  sessionWindowOnStart,
  startOfMonth,
  FREE_CHAT_MESSAGE_LIMIT,
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
  // Issue #5/#6: a paid window has been opened on this session at least once
  // (paidStartedAt set). Lets the client keep the chat + «Продлить» on screen
  // after the window lapses, instead of dropping back to the start gate.
  started: boolean;
  paidActive: boolean;
  minutesRemaining: number;
  // B417: precise expiry timestamp (ISO) so the client can run a live, to-the-
  // second countdown timer for the paid session instead of integer minutes.
  expiresAt: string | null;
  // B445: окончание оплаченного окна (ISO), даже если оно уже в прошлом — клиент
  // считает от него «окно решения» (grace) о продлении и блокирует чат по истечении.
  windowExpiresAt: string | null;
  cost: { credits: number; kopecks: number };
};

function publicState(row: SessionRow, now = new Date()): PublicSessionState {
  const state = toState(row);
  const active = isPaidSessionActive(state, now);
  return {
    id: row.id,
    mode: isCompanionMode(row.mode) ? row.mode : "explore",
    messages: toMessages(row.messages),
    freeRemaining: freeMessagesRemaining(row.freeMessagesUsed),
    started: row.paidStartedAt != null,
    paidActive: active,
    minutesRemaining: paidMinutesRemaining(state, now),
    expiresAt: active && row.paidExpiresAt ? row.paidExpiresAt.toISOString() : null,
    windowExpiresAt: row.paidExpiresAt ? row.paidExpiresAt.toISOString() : null,
    cost: { credits: CHAT_SESSION_COST_CREDITS, kopecks: CHAT_SESSION_PRICE_KOPECKS },
  };
}

// B445: «виртуальное» состояние для свежего захода на /products/chat без сессии.
// Реальная строка companionChatSession создаётся только при нажатии «Начать диалог»,
// поэтому простой просмотр страницы больше не плодит пустые сессии в БД.
function virtualSessionState(): PublicSessionState {
  return {
    id: "",
    mode: "explore",
    messages: [],
    freeRemaining: FREE_CHAT_MESSAGE_LIMIT,
    started: false,
    paidActive: false,
    minutesRemaining: 0,
    expiresAt: null,
    windowExpiresAt: null,
    cost: { credits: CHAT_SESSION_COST_CREDITS, kopecks: CHAT_SESSION_PRICE_KOPECKS },
  };
}

// Task 7: when «Продолжить разговор в чате» continues a checkin разбор, the chat
// must «просто продолжиться» — the первичный разбор and the clarifying dialogue
// belong in the chat history so it does not feel like a different conversation.
// We seed the new session with the dialogue thread (mapped to chat roles).
async function buildSeedMessagesFromDialogue(userId: string, dialogueId: string): Promise<CompanionMessage[]> {
  try {
    const dialogue = await db.dialogue.findFirst({
      where: { id: dialogueId, userId, deletedAt: null },
      select: { messages: { orderBy: { createdAt: "asc" }, select: { role: true, content: true } } },
    });
    if (!dialogue) return [];
    const at = new Date().toISOString();
    return dialogue.messages
      .filter((message) => message.role !== "SYSTEM" && message.content.trim())
      .map((message) => ({
        role: message.role === "USER" ? ("user" as const) : ("companion" as const),
        // Drop the legacy «Если хочется глубже» recommendation from the seeded
        // разбор (recommendations live outside the chat) — no-op for other turns.
        text: stripDeepeningSection(message.content).slice(0, MAX_MESSAGE_CHARS),
        at,
      }))
      .filter((message) => message.text.trim().length > 0);
  } catch {
    return [];
  }
}

// Issue #7: seed a companion chat continued from a chat-analysis разбор with the
// platform's read («главное» = insight + assessment), so the chat «просто
// продолжается» from that conclusion instead of opening blank or, worse, on the
// user's unrelated standalone session.
async function buildSeedMessagesFromAnalysis(userId: string, analysisId: string): Promise<CompanionMessage[]> {
  try {
    const result = await db.productResult.findFirst({
      where: { id: analysisId, userId, productKey: "chat-analysis", deletedAt: null },
      select: { resultText: true },
    });
    if (!result?.resultText) return [];
    const parsed = tryParseChatAnalysis(result.resultText);
    if (!parsed) return [];
    const summary = [parsed.insight, parsed.assessment]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join("\n\n")
      .slice(0, MAX_MESSAGE_CHARS);
    if (!summary.trim()) return [];
    return [{ role: "companion", text: summary, at: new Date().toISOString() }];
  } catch {
    return [];
  }
}

export async function getOrCreateSession(input: {
  userId: string;
  sourceDialogueId?: string | null;
  sourceAnalysisId?: string | null;
  mode?: string | null;
}): Promise<SessionRow> {
  const mode = isCompanionMode(input.mode) ? input.mode : "explore";
  const sourceDialogueId = input.sourceDialogueId ?? null;
  const sourceAnalysisId = input.sourceAnalysisId ?? null;
  // Task 7: the session is keyed to its source — a specific разбор (dialogue), a
  // specific chat-analysis, or the standalone /products/chat (both null) — so
  // continuing a given context always reuses / creates its OWN chat, never the
  // user's latest unrelated conversation.
  const where = sourceAnalysisId
    ? { userId: input.userId, sourceAnalysisId }
    : { userId: input.userId, sourceDialogueId, sourceAnalysisId: null };
  const existing = await db.companionChatSession.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing as SessionRow;
  const seededMessages = sourceAnalysisId
    ? await buildSeedMessagesFromAnalysis(input.userId, sourceAnalysisId)
    : sourceDialogueId
      ? await buildSeedMessagesFromDialogue(input.userId, sourceDialogueId)
      : [];
  const created = await db.companionChatSession.create({
    data: {
      userId: input.userId,
      sourceDialogueId,
      sourceAnalysisId,
      mode,
      ...(seededMessages.length > 0
        ? { messages: seededMessages as unknown as Prisma.InputJsonValue }
        : {}),
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
  | { ok: false; reason: "insufficient_credits" | "not_found" | "needs_active_session" | "grace_expired" };

// Старт оплаченного сеанса: сперва квота Premium (2/мес), иначе списание 4 баллов.
// B445: строка сессии создаётся ИМЕННО здесь (при «Начать диалог»), а не на заходе
// на страницу — если sessionId не передан, создаём/находим её под нужный источник.
export async function startPaidSession(input: {
  userId: string;
  sessionId?: string | null;
  sourceDialogueId?: string | null;
  sourceAnalysisId?: string | null;
}): Promise<StartSessionResult> {
  const row = input.sessionId
    ? await loadSession(input.userId, input.sessionId)
    : await getOrCreateSession({
        userId: input.userId,
        sourceDialogueId: input.sourceDialogueId,
        sourceAnalysisId: input.sourceAnalysisId,
      });
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
  // B445: продлить можно, пока сессия активна ИЛИ пока не истекло «окно решения»
  // (grace) после 00:00. Не начатую сессию продлевать нельзя (обход старта), и
  // после grace — тоже (сессия закрыта, в неё уже нельзя зайти для продолжения).
  if (toState(row).paidStartedAt == null) {
    return { ok: false, reason: "needs_active_session" };
  }
  if (!isWithinExtendGrace(toState(row), now)) {
    return { ok: false, reason: "grace_expired" };
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

export async function getSessionState(input: { userId: string; sessionId?: string | null; sourceDialogueId?: string | null; sourceAnalysisId?: string | null }): Promise<PublicSessionState> {
  // Закреплённая сессия по id — всегда загружаем как есть.
  if (input.sessionId) {
    const row = await loadSession(input.userId, input.sessionId);
    if (row) return publicState(row);
  }
  // Продолжение разбора (dialogue/analysis) приходит с явным намерением общаться —
  // get-or-create, чтобы засеять историю из источника.
  if (input.sourceDialogueId || input.sourceAnalysisId) {
    const seeded = await getOrCreateSession({
      userId: input.userId,
      sourceDialogueId: input.sourceDialogueId,
      sourceAnalysisId: input.sourceAnalysisId,
    });
    return publicState(seeded);
  }
  // Standalone /products/chat: по умолчанию зовём начать НОВУЮ сессию (виртуальное
  // состояние без создания строки). Прошлую самостоятельную сессию переиспользуем
  // ТОЛЬКО пока её оплаченное окно ещё активно (таймер идёт) — чтобы не выбрасывать
  // человека из диалога, за который он платит. Завершённую/истёкшую сессию не
  // подхватываем: заход на страницу открывает приглашение к новой сессии, а не
  // старый (уже закрытый) чат. B449.
  const existing = await db.companionChatSession.findFirst({
    where: { userId: input.userId, sourceDialogueId: null, sourceAnalysisId: null },
    orderBy: { updatedAt: "desc" },
  });
  if (existing && isPaidSessionActive(toState(existing as SessionRow))) {
    return publicState(existing as SessionRow);
  }
  return virtualSessionState();
}

export { premiumIncludedRemaining };
