// B464 round-5 #13 — support chat SESSIONS on top of SupportConversation.
//
// A «сессия» is a SupportConversation. Lifecycle rules (owner spec):
//   • no sessions yet → the chat auto-starts one on the first message;
//   • sessions exist → the client picks: view any past session (read-only) or
//     CONTINUE — but only the LATEST session can be continued;
//   • a session with no activity for 30 minutes is closed by timeout (lazily,
//     on the next list/read). Staff replies still land in closed sessions —
//     the Telegram webhooks route by unique thread id regardless of status.
//
// Pure helpers only — the API routes own the db work.

export const SUPPORT_SESSION_INACTIVITY_MS = 30 * 60 * 1000;

/** Сессия без активности дольше 30 минут считается закрытой по таймауту. */
export function isSupportSessionStale(lastActivityAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastActivityAt.getTime() > SUPPORT_SESSION_INACTIVITY_MS;
}

/**
 * Присоединять сообщение без явного conversationId (жалоба/веб-форма, первый
 * заход) можно только в СВЕЖУЮ открытую сессию; иначе создаётся новая.
 */
export function canReuseSupportSession(
  status: string,
  lastActivityAt: Date,
  now: Date = new Date(),
): boolean {
  return status === "OPEN" && !isSupportSessionStale(lastActivityAt, now);
}

/** Продолжать (и переоткрывать закрытую по таймауту) можно ТОЛЬКО последнюю сессию. */
export function canContinueSupportSession(
  conversationId: string,
  latestConversationId: string | null,
): boolean {
  return latestConversationId !== null && conversationId === latestConversationId;
}

export type SupportSessionSummary = {
  id: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  lastActivityAt: string;
  preview: string;
  messageCount: number;
  canContinue: boolean;
};

/** Короткий превью-заголовок сессии из первого сообщения клиента. */
export function supportSessionPreview(firstUserMessage: string | null | undefined, subject?: string | null): string {
  const source = (firstUserMessage ?? subject ?? "").trim().replace(/\s+/g, " ");
  if (!source) return "Обращение в поддержку";
  return source.length > 90 ? `${source.slice(0, 90)}…` : source;
}
