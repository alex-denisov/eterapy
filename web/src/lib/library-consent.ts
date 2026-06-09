// B363 / Механика 12 — library publish consent.
//
// The landing promises «Приватно. Не публикуется без согласия.» This module is
// the single source of truth for what that consent means and how it gates
// publication. The strict invariant: a dialogue is publicly publishable ONLY
// when its owner gave explicit consent AND a moderator approved it. The default
// (no row, NULL status) is always private.

export type LibraryStatus =
  | "PENDING_REVIEW" // owner consented; awaiting moderation
  | "PUBLISHED" // owner consented AND moderator approved → public
  | "WITHDRAWN" // owner revoked consent (or moderator removed) → private again
  | "REJECTED"; // moderator declined → private

export type DialogueConsentFields = {
  libraryConsentAt: Date | null;
  libraryStatus: string | null;
};

const KNOWN_STATUSES: ReadonlySet<string> = new Set<LibraryStatus>([
  "PENDING_REVIEW",
  "PUBLISHED",
  "WITHDRAWN",
  "REJECTED",
]);

export function isLibraryStatus(value: string | null | undefined): value is LibraryStatus {
  return typeof value === "string" && KNOWN_STATUSES.has(value);
}

/**
 * STRICT gate. A question is shown in the public library only when its owner
 * has consented (timestamp present) AND it has been approved (PUBLISHED).
 * Everything else — no consent, pending, withdrawn, rejected — stays private.
 */
export function isPubliclyPublishable(d: DialogueConsentFields): boolean {
  return d.libraryStatus === "PUBLISHED" && d.libraryConsentAt != null;
}

/** Whether the owner has an active publish request (consent not revoked). */
export function hasActiveConsent(d: DialogueConsentFields): boolean {
  return (
    d.libraryConsentAt != null &&
    (d.libraryStatus === "PENDING_REVIEW" || d.libraryStatus === "PUBLISHED")
  );
}

/** Whether the owner may grant consent right now (no active request yet). */
export function canGrantConsent(d: DialogueConsentFields): boolean {
  return !hasActiveConsent(d);
}

/** Whether the owner may withdraw an existing request. */
export function canWithdrawConsent(d: DialogueConsentFields): boolean {
  return hasActiveConsent(d);
}

export type ConsentBadge = {
  label: string;
  tone: "private" | "pending" | "published";
};

/** Russian status label + tone for the My-Map UI. */
export function consentBadge(d: DialogueConsentFields): ConsentBadge {
  switch (d.libraryStatus) {
    case "PENDING_REVIEW":
      return { label: "На модерации", tone: "pending" };
    case "PUBLISHED":
      return { label: "В библиотеке", tone: "published" };
    case "WITHDRAWN":
    case "REJECTED":
    default:
      return { label: "Приватно", tone: "private" };
  }
}

/** Field patch for granting consent (owner action). */
export function grantConsentPatch(now: Date = new Date()): DialogueConsentFields {
  return { libraryConsentAt: now, libraryStatus: "PENDING_REVIEW" };
}

/**
 * Field patch for withdrawing consent (owner action). The timestamp is cleared
 * so the strict gate (`isPubliclyPublishable`) fails immediately even if some
 * stale status lingers.
 */
export function withdrawConsentPatch(): DialogueConsentFields {
  return { libraryConsentAt: null, libraryStatus: "WITHDRAWN" };
}
