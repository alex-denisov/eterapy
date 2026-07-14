import type { PractitionerTaxReviewStatus, PractitionerTaxStatus, Prisma } from "@prisma/client";
import db from "@/lib/db";

export const AGENT_OFFER_VERSION = "agent-offer-2026-06-18";

/** B466 owner-fix 2026-07-14 #5: человекочитаемое название версии оферты —
    технический слаг agent-offer-YYYY-MM-DD в UI не показываем. */
export const AGENT_OFFER_VERSION_LABEL = "редакция от 18 июня 2026 года";

export const practitionerComplianceSelect = {
  id: true,
  status: true,
  bookingOverrideEnabled: true,
  agentOfferAcceptedAt: true,
  agentOfferVersion: true,
  taxStatus: true,
  taxReviewStatus: true,
  taxStatusVerifiedAt: true,
  payoutDetails: {
    select: {
      type: true,
      inn: true,
      kycStatus: true,
    },
  },
} satisfies Prisma.PractitionerSelect;

export type PractitionerComplianceSnapshot = Prisma.PractitionerGetPayload<{
  select: typeof practitionerComplianceSelect;
}>;

export type PractitionerComplianceReason =
  | "practitioner_inactive"
  | "agent_offer_required"
  | "tax_status_required"
  | "tax_status_not_verified"
  | "payout_details_required"
  | "inn_required"
  | "entity_details_required"
  | "entity_kyc_required";

export function evaluatePractitionerCommercialGate(practitioner: PractitionerComplianceSnapshot | null) {
  const reasons: PractitionerComplianceReason[] = [];

  if (!practitioner || practitioner.status !== "ACTIVE") {
    reasons.push("practitioner_inactive");
  }

  // B459 (walkthrough item 15): a superadmin can manually enable booking for a
  // practitioner the platform has vetted out-of-band (demo/seed accounts, or a
  // specialist cleared by support before the requisites flow lands). The override
  // bypasses the COMMERCIAL requirements below (agent offer, tax status, payout
  // details) but never the active-status check above — an inactive practitioner
  // stays unbookable. Real practitioners still need full requisites to be paid out.
  if (practitioner?.bookingOverrideEnabled) {
    return { allowed: reasons.length === 0, reasons };
  }

  if (!practitioner?.agentOfferAcceptedAt || practitioner.agentOfferVersion !== AGENT_OFFER_VERSION) {
    reasons.push("agent_offer_required");
  }
  if (!isKnownTaxStatus(practitioner?.taxStatus)) {
    reasons.push("tax_status_required");
  }
  if (!isTaxStatusVerified(practitioner?.taxReviewStatus, practitioner?.taxStatusVerifiedAt)) {
    reasons.push("tax_status_not_verified");
  }

  const details = practitioner?.payoutDetails;
  if (!details?.type) {
    reasons.push("payout_details_required");
  }
  if (!details?.inn) {
    reasons.push("inn_required");
  }
  if (
    (practitioner?.taxStatus === "INDIVIDUAL_ENTREPRENEUR" || practitioner?.taxStatus === "LEGAL_ENTITY")
    && details?.type !== "ENTITY"
  ) {
    reasons.push("entity_details_required");
  }
  if (details?.type === "ENTITY" && details.kycStatus !== "VERIFIED") {
    reasons.push("entity_kyc_required");
  }

  return { allowed: reasons.length === 0, reasons };
}
export async function assertPractitionerBookingAllowed(practitionerId: string) {
  const practitioner = await db.practitioner.findUnique({
    where: { id: practitionerId },
    select: practitionerComplianceSelect,
  });
  return evaluatePractitionerCommercialGate(practitioner);
}

export function isKnownTaxStatus(status: PractitionerTaxStatus | null | undefined) {
  return status === "SELF_EMPLOYED" || status === "INDIVIDUAL_ENTREPRENEUR" || status === "LEGAL_ENTITY";
}

export function isTaxStatusVerified(status: PractitionerTaxReviewStatus | null | undefined, verifiedAt?: Date | null) {
  return status === "VERIFIED" && Boolean(verifiedAt);
}

export function normalizeTaxStatus(value: unknown): PractitionerTaxStatus | null {
  if (value === "SELF_EMPLOYED" || value === "INDIVIDUAL_ENTREPRENEUR" || value === "LEGAL_ENTITY") return value;
  return null;
}

export function normalizeTaxReviewStatus(value: unknown): PractitionerTaxReviewStatus | null {
  if (value === "PENDING" || value === "VERIFIED" || value === "REJECTED" || value === "EXPIRED") return value;
  return null;
}
