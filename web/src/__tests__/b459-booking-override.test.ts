import { evaluatePractitionerCommercialGate, AGENT_OFFER_VERSION } from "@/lib/practitioner-compliance";

/**
 * B459 (walkthrough item 15): a практик marked «Проверен ETerapy» was still blocked
 * at booking with «до проверки документов и реквизитов», because verification
 * (diploma/ethics) is separate from the COMMERCIAL gate (agent offer + tax status +
 * payout requisites). Demo/seed practitioners have none of the latter, so every one
 * of them was unbookable. The fix is a superadmin-only manual booking-enable override
 * that bypasses the commercial requirements (but never the active-status check).
 */
describe("B459 superadmin manual booking-enable override", () => {
  const incompleteButOverridden = {
    id: "p1",
    status: "ACTIVE" as const,
    bookingOverrideEnabled: true,
    agentOfferAcceptedAt: null,
    agentOfferVersion: null,
    taxStatus: "UNKNOWN" as const,
    taxReviewStatus: "PENDING" as const,
    taxStatusVerifiedAt: null,
    payoutDetails: null,
  };

  it("allows booking when the override is on despite missing offer/tax/payout", () => {
    const gate = evaluatePractitionerCommercialGate(incompleteButOverridden);
    expect(gate.allowed).toBe(true);
    expect(gate.reasons).toEqual([]);
  });

  it("still blocks an inactive practitioner even with the override on", () => {
    const gate = evaluatePractitionerCommercialGate({
      ...incompleteButOverridden,
      status: "PENDING" as const,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toEqual(["practitioner_inactive"]);
  });

  it("keeps blocking an incomplete practitioner when the override is off", () => {
    const gate = evaluatePractitionerCommercialGate({
      ...incompleteButOverridden,
      bookingOverrideEnabled: false,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toEqual(expect.arrayContaining([
      "agent_offer_required",
      "tax_status_required",
      "payout_details_required",
    ]));
  });

  it("does not change a fully-compliant practitioner (override irrelevant)", () => {
    const fullyCompliant = {
      ...incompleteButOverridden,
      bookingOverrideEnabled: false,
      agentOfferAcceptedAt: new Date("2026-06-18T10:00:00.000Z"),
      agentOfferVersion: AGENT_OFFER_VERSION,
      taxStatus: "SELF_EMPLOYED" as const,
      taxReviewStatus: "VERIFIED" as const,
      taxStatusVerifiedAt: new Date("2026-06-18T10:05:00.000Z"),
      payoutDetails: { type: "CARD", inn: "123456789012", kycStatus: "NOT_REQUIRED" },
    };
    expect(evaluatePractitionerCommercialGate(fullyCompliant).allowed).toBe(true);
  });
});
