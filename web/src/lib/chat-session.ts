// B386 (M26) — биллинг и состояние платного чат-сеанса. Чистая логика (без БД),
// чтобы тарификацию можно было покрыть тестами без интеграции.
//
// Цена утверждена владельцем: сеанс 45 мин = 790 ₽ / 4 балла; продление +30 мин =
// 2 балла; Premium — 2 включённых сеанса в месяц. Первый мини-чат бесплатен
// (≈10 сообщений), дальше — платный сеанс.

export const CHAT_SESSION_PRODUCT_KEY = "chat-session";
export const CHAT_EXTENSION_PRODUCT_KEY = "chat-extension";

export const CHAT_SESSION_COST_CREDITS = 4;
export const CHAT_SESSION_PRICE_KOPECKS = 79000; // 790 ₽
export const CHAT_SESSION_MINUTES = 45;

export const CHAT_EXTENSION_COST_CREDITS = 2;
export const CHAT_EXTENSION_MINUTES = 30;

export const PREMIUM_INCLUDED_SESSIONS_PER_MONTH = 2;

export const FREE_CHAT_MESSAGE_LIMIT = 10;

export type ChatSessionState = {
  freeMessagesUsed: number;
  paidStartedAt: Date | null;
  paidExpiresAt: Date | null;
};

export function freeMessagesRemaining(used: number): number {
  return Math.max(0, FREE_CHAT_MESSAGE_LIMIT - Math.max(0, used));
}

// Активен ли оплаченный сеанс прямо сейчас.
export function isPaidSessionActive(session: ChatSessionState, now: Date = new Date()): boolean {
  return Boolean(session.paidExpiresAt && session.paidExpiresAt.getTime() > now.getTime());
}

export function paidMinutesRemaining(session: ChatSessionState, now: Date = new Date()): number {
  if (!session.paidExpiresAt) return 0;
  const ms = session.paidExpiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 60_000));
}

export type ChatSendDecision =
  | { allowed: true; kind: "free"; freeRemaining: number }
  | { allowed: true; kind: "paid"; minutesRemaining: number }
  | { allowed: false; reason: "needs_session"; cost: { credits: number; kopecks: number } };

// Можно ли отправить ещё одно сообщение: пока есть бесплатные ИЛИ активен
// оплаченный сеанс. Иначе нужен (новый) платный сеанс.
export function decideChatSend(session: ChatSessionState, now: Date = new Date()): ChatSendDecision {
  if (isPaidSessionActive(session, now)) {
    return { allowed: true, kind: "paid", minutesRemaining: paidMinutesRemaining(session, now) };
  }
  const remaining = freeMessagesRemaining(session.freeMessagesUsed);
  if (remaining > 0) {
    return { allowed: true, kind: "free", freeRemaining: remaining };
  }
  return {
    allowed: false,
    reason: "needs_session",
    cost: { credits: CHAT_SESSION_COST_CREDITS, kopecks: CHAT_SESSION_PRICE_KOPECKS },
  };
}

// Новые границы оплаченного окна при старте/продлении сеанса.
export function sessionWindowOnStart(now: Date = new Date()): { startedAt: Date; expiresAt: Date } {
  return { startedAt: now, expiresAt: new Date(now.getTime() + CHAT_SESSION_MINUTES * 60_000) };
}

// Issue #6: продлевать сессию можно, пока она была начата (paidStartedAt задан) —
// даже если окно уже истекло (таймер дошёл до 00:00). Это закрывает кейс «продлить
// на отметке 00:00». Запрещаем продление только НЕ начатой сессии — иначе это был
// бы способ получить 30 минут за 2 балла в обход полноценного старта (4 балла).
export function canExtendSession(session: ChatSessionState): boolean {
  return session.paidStartedAt != null;
}

export function sessionWindowOnExtend(session: ChatSessionState, now: Date = new Date()): { expiresAt: Date } {
  // Продлеваем от конца активного окна, либо от «сейчас», если уже истекло.
  const base = isPaidSessionActive(session, now) && session.paidExpiresAt
    ? session.paidExpiresAt.getTime()
    : now.getTime();
  return { expiresAt: new Date(base + CHAT_EXTENSION_MINUTES * 60_000) };
}

// Доступен ли Premium-включённый сеанс (2/мес) без списания баллов.
export function canUsePremiumIncludedSession(input: {
  isPremium: boolean;
  includedUsedThisMonth: number;
}): boolean {
  return input.isPremium && input.includedUsedThisMonth < PREMIUM_INCLUDED_SESSIONS_PER_MONTH;
}

export function premiumIncludedRemaining(includedUsedThisMonth: number): number {
  return Math.max(0, PREMIUM_INCLUDED_SESSIONS_PER_MONTH - Math.max(0, includedUsedThisMonth));
}

// Начало текущего календарного месяца (для квоты Premium-сеансов).
export function startOfMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
