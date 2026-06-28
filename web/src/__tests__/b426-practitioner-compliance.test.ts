import { evaluatePractitionerCommercialGate, AGENT_OFFER_VERSION } from "@/lib/practitioner-compliance";

describe("B426 practitioner commercial compliance gate", () => {
  const base = {
    id: "practitioner-1",
    status: "ACTIVE" as const,
    bookingOverrideEnabled: false,
    agentOfferAcceptedAt: new Date("2026-06-18T10:00:00.000Z"),
    agentOfferVersion: AGENT_OFFER_VERSION,
    taxStatus: "SELF_EMPLOYED" as const,
    taxReviewStatus: "VERIFIED" as const,
    taxStatusVerifiedAt: new Date("2026-06-18T10:05:00.000Z"),
    payoutDetails: {
      type: "CARD",
      inn: "123456789012",
      kycStatus: "NOT_REQUIRED",
    },
  };

  it("allows bookings and payouts only after agent offer, tax status, INN, and details are ready", () => {
    expect(evaluatePractitionerCommercialGate(base).allowed).toBe(true);
  });

  it("blocks missing agent offer, tax verification, payout details, and INN with explicit reasons", () => {
    const gate = evaluatePractitionerCommercialGate({
      ...base,
      agentOfferAcceptedAt: null,
      agentOfferVersion: null,
      taxStatus: "UNKNOWN",
      taxReviewStatus: "PENDING",
      taxStatusVerifiedAt: null,
      payoutDetails: null,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toEqual(expect.arrayContaining([
      "agent_offer_required",
      "tax_status_required",
      "tax_status_not_verified",
      "payout_details_required",
      "inn_required",
    ]));
  });

  it("requires entity requisites and KYC for IP/LLC statuses", () => {
    const gate = evaluatePractitionerCommercialGate({
      ...base,
      taxStatus: "LEGAL_ENTITY",
      payoutDetails: { type: "CARD", inn: "1234567890", kycStatus: "NOT_REQUIRED" },
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain("entity_details_required");

    const entityGate = evaluatePractitionerCommercialGate({
      ...base,
      taxStatus: "INDIVIDUAL_ENTREPRENEUR",
      payoutDetails: { type: "ENTITY", inn: "123456789012", kycStatus: "PENDING" },
    });
    expect(entityGate.reasons).toContain("entity_kyc_required");
  });
});
