// INC-065 (round 2): cross-component signal so the admin sidebar badges
// re-fetch immediately after a moderator mutation (booking cancelled,
// complaint resolved, review moderated, …) — not only after a page reload.
// Producers call dispatchAdminCountsChanged(); AdminShell listens.
export const ADMIN_COUNTS_CHANGED_EVENT = "eterapy:admin-counts-changed";

export function dispatchAdminCountsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED_EVENT));
  }
}
