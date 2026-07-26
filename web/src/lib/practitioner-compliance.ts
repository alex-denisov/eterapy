import type { PractitionerTaxReviewStatus, PractitionerTaxStatus, Prisma } from "@prisma/client";
import db from "@/lib/db";
import { normalizeRobokassaAccount } from "@/lib/payments/robokassa-split";

// B572 (owner 2026-07-22): дата публикации всех юридических документов — день
// регистрации ИП. Раньше этой даты оказывать услуги было некому, поэтому оферта
// не может быть датирована июнем. Прод на момент правки: акцептов агентской
// оферты — 0, инвалидировать нечего.
export const AGENT_OFFER_VERSION = "agent-offer-2026-07-20";

/** B466 owner-fix 2026-07-14 #5: человекочитаемое название версии оферты —
    технический слаг agent-offer-YYYY-MM-DD в UI не показываем. */
export const AGENT_OFFER_VERSION_LABEL = "редакция от 20 июля 2026 года";

export const practitionerComplianceSelect = {
  id: true,
  status: true,
  demoAccount: true,
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
      // B583 (решение владельца 2026-07-26): выплата специалисту идёт сплитом
      // Robokassa, а сплит адресуется ТОЛЬКО на аккаунт Robokassa. Без него
      // выплату отправить некуда, поэтому аккаунт обязателен — продавать
      // сессию, за которую мы не можем заплатить, нельзя.
      robokassaAccount: true,
    },
  },
} satisfies Prisma.PractitionerSelect;

export type PractitionerComplianceSnapshot = Prisma.PractitionerGetPayload<{
  select: typeof practitionerComplianceSelect;
}>;

export type PractitionerComplianceReason =
  | "practitioner_inactive"
  | "demo_account"
  | "agent_offer_required"
  | "tax_status_required"
  | "tax_status_not_verified"
  | "payout_details_required"
  | "inn_required"
  | "entity_details_required"
  | "entity_kyc_required"
  | "robokassa_account_required";

export function evaluatePractitionerCommercialGate(practitioner: PractitionerComplianceSnapshot | null) {
  const reasons: PractitionerComplianceReason[] = [];

  if (!practitioner || practitioner.status !== "ACTIVE") {
    reasons.push("practitioner_inactive");
  }

  // B584 (owner 2026-07-26): за демо-профилем нет человека, который проведёт
  // сессию. Проверка стоит ВЫШЕ override'а намеренно: override включён именно у
  // демо-аккаунтов (B459 их же и открывал), поэтому «сначала override» оставило
  // бы запись открытой. Ниже — про документы; здесь — про то, что специалиста
  // не существует, и никакие документы этого не меняют.
  if (practitioner?.demoAccount) {
    reasons.push("demo_account");
    return { allowed: false, reasons };
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
  // B583: аккаунт Robokassa специалист заводит сам — платформа его не создаёт и
  // по банковским реквизитам через Robokassa платить не может. Банковские
  // реквизиты остаются: они нужны фискальной части и ручной выплате.
  if (!normalizeRobokassaAccount(details?.robokassaAccount)) {
    reasons.push("robokassa_account_required");
  }

  return { allowed: reasons.length === 0, reasons };
}
/**
 * B584: витрина слотов закрывается ТОЛЬКО по демо-признаку, а не по всему
 * коммерческому гейту. Тот же `/api/slots/available` открывает сетку переноса в
 * кабинете практика и в панели администратора — у живого специалиста без
 * реквизитов перенос ломать нельзя, а сессию продавать нельзя (это уже проверяет
 * `POST /api/bookings`). Демо-профиль закрыт для всех трёх поверхностей: за ним
 * никого нет, переносить тоже нечего.
 */
export async function isDemoPractitioner(practitionerId: string) {
  const practitioner = await db.practitioner.findUnique({
    where: { id: practitionerId },
    select: { demoAccount: true },
  });
  return Boolean(practitioner?.demoAccount);
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
