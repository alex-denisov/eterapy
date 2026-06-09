import {
  canGrantConsent,
  canWithdrawConsent,
  consentBadge,
  grantConsentPatch,
  hasActiveConsent,
  isLibraryStatus,
  isPubliclyPublishable,
  withdrawConsentPatch,
  type DialogueConsentFields,
} from "@/lib/library-consent";

// B363 / Механика 12 — library publish consent.
// Core invariant under test: a question is NEVER public without explicit
// owner consent, and consent alone is not enough — it must also be approved.

const PRIVATE: DialogueConsentFields = { libraryConsentAt: null, libraryStatus: null };
const PENDING: DialogueConsentFields = { libraryConsentAt: new Date(), libraryStatus: "PENDING_REVIEW" };
const PUBLISHED: DialogueConsentFields = { libraryConsentAt: new Date(), libraryStatus: "PUBLISHED" };
const WITHDRAWN: DialogueConsentFields = { libraryConsentAt: null, libraryStatus: "WITHDRAWN" };
const REJECTED: DialogueConsentFields = { libraryConsentAt: new Date(), libraryStatus: "REJECTED" };

describe("isPubliclyPublishable — strict gate", () => {
  it("keeps a default (no-consent) question private", () => {
    expect(isPubliclyPublishable(PRIVATE)).toBe(false);
  });

  it("does NOT publish a question that only has consent (pending moderation)", () => {
    expect(isPubliclyPublishable(PENDING)).toBe(false);
  });

  it("publishes only when consented AND approved", () => {
    expect(isPubliclyPublishable(PUBLISHED)).toBe(true);
  });

  it("never publishes a withdrawn or rejected question", () => {
    expect(isPubliclyPublishable(WITHDRAWN)).toBe(false);
    expect(isPubliclyPublishable(REJECTED)).toBe(false);
  });

  it("refuses to publish PUBLISHED status if the consent timestamp is missing (defensive)", () => {
    expect(isPubliclyPublishable({ libraryConsentAt: null, libraryStatus: "PUBLISHED" })).toBe(false);
  });
});

describe("consent state machine", () => {
  it("allows granting consent only when there is no active request", () => {
    expect(canGrantConsent(PRIVATE)).toBe(true);
    expect(canGrantConsent(WITHDRAWN)).toBe(true);
    expect(canGrantConsent(REJECTED)).toBe(true);
    expect(canGrantConsent(PENDING)).toBe(false);
    expect(canGrantConsent(PUBLISHED)).toBe(false);
  });

  it("allows withdrawing only an active request", () => {
    expect(canWithdrawConsent(PENDING)).toBe(true);
    expect(canWithdrawConsent(PUBLISHED)).toBe(true);
    expect(canWithdrawConsent(PRIVATE)).toBe(false);
    expect(canWithdrawConsent(WITHDRAWN)).toBe(false);
  });

  it("hasActiveConsent reflects pending/published only", () => {
    expect(hasActiveConsent(PENDING)).toBe(true);
    expect(hasActiveConsent(PUBLISHED)).toBe(true);
    expect(hasActiveConsent(PRIVATE)).toBe(false);
    expect(hasActiveConsent(REJECTED)).toBe(false);
  });
});

describe("consent patches", () => {
  it("grant patch sets a timestamp and PENDING_REVIEW", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    expect(grantConsentPatch(now)).toEqual({ libraryConsentAt: now, libraryStatus: "PENDING_REVIEW" });
  });

  it("withdraw patch clears the timestamp so the gate fails immediately", () => {
    const patch = withdrawConsentPatch();
    expect(patch.libraryConsentAt).toBeNull();
    expect(patch.libraryStatus).toBe("WITHDRAWN");
    expect(isPubliclyPublishable(patch)).toBe(false);
  });

  it("a freshly granted consent is pending, not yet public", () => {
    const patch = grantConsentPatch();
    expect(hasActiveConsent(patch)).toBe(true);
    expect(isPubliclyPublishable(patch)).toBe(false);
  });
});

describe("consentBadge + isLibraryStatus", () => {
  it("maps statuses to Russian labels and tones", () => {
    expect(consentBadge(PRIVATE)).toEqual({ label: "Приватно", tone: "private" });
    expect(consentBadge(PENDING)).toEqual({ label: "На модерации", tone: "pending" });
    expect(consentBadge(PUBLISHED)).toEqual({ label: "В библиотеке", tone: "published" });
    expect(consentBadge(WITHDRAWN)).toEqual({ label: "Приватно", tone: "private" });
  });

  it("recognizes known statuses only", () => {
    expect(isLibraryStatus("PUBLISHED")).toBe(true);
    expect(isLibraryStatus("PENDING_REVIEW")).toBe(true);
    expect(isLibraryStatus("nonsense")).toBe(false);
    expect(isLibraryStatus(null)).toBe(false);
  });
});
