// Issue #5: the live chat timer must replace the hero price pill once a paid
// session opens — but the price pill lives in the product hero (above the panel)
// while the session state lives in the chat panel. Rather than lift all chat
// state into a page-level wrapper, the panel broadcasts a tiny session snapshot
// on a window event and the hero price subscribes. Mirrors the balance-events
// pattern already used for the header balance pill.

export type CompanionSessionSnapshot = {
  // A paid window has been opened in this view (stays true after it lapses, so
  // the hero keeps showing 00:00 until the client extends — never the price).
  started: boolean;
  // Precise expiry (ISO) so the hero can run its own to-the-second countdown.
  expiresAt: string | null;
};

const EVENT_NAME = "companion-session-changed";

export function dispatchCompanionSession(snapshot: CompanionSessionSnapshot): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CompanionSessionSnapshot>(EVENT_NAME, { detail: snapshot }));
}

export function onCompanionSession(callback: (snapshot: CompanionSessionSnapshot) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CompanionSessionSnapshot>).detail;
    if (detail) callback(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
