/** PRB-003 · Единая политика жизненного цикла чата видеосессии. */

export const VIDEO_CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;
export const VIDEO_CHAT_TEXT_MAX = 2_000;
export const VIDEO_CHAT_PAGE_MAX = 50;

export interface VideoChatSessionState {
  status: string;
  endedAt: Date | null;
}

export function videoChatWritable(session: VideoChatSessionState): boolean {
  return session.status === "WAITING" || session.status === "ACTIVE";
}

export function videoChatRetentionExpiresAt(
  session: VideoChatSessionState,
): Date | null {
  return session.endedAt
    ? new Date(session.endedAt.getTime() + VIDEO_CHAT_RETENTION_MS)
    : null;
}

export function videoChatReadable(
  session: VideoChatSessionState,
  now: Date,
): boolean {
  const expiresAt = videoChatRetentionExpiresAt(session);
  return !expiresAt || expiresAt > now;
}
