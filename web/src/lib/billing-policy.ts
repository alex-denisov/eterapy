import type { Prisma } from "@prisma/client";
import { currentLegalDocumentVersionSnapshot } from "@/lib/legal-documents";

export const BILLING_CURRENCY = "RUB";
export const RU_ONLY_PAYMENT_DECLINE_MESSAGE =
  "Оплата временно доступна только российскими платёжными средствами. Попробуйте карту российского банка или другой способ оплаты.";

export type PaymentDeclineReason =
  | "ru_payment_method_required"
  | "provider_payment_canceled"
  | "provider_payment_restricted"
  | "unknown";

type ProviderPaymentLike = {
  amount?: { currency?: string | null } | null;
  status?: string | null;
  cancellation_details?: {
    party?: string | null;
    reason?: string | null;
  } | null;
  payment_method?: {
    card?: {
      issuer_country?: string | null;
    } | null;
  } | null;
};

const FOREIGN_CARD_PROVIDER_REASONS = new Set([
  "payment_method_restricted",
  "country_not_supported",
  "issuer_unavailable",
  "identification_required",
]);

const SENSITIVE_CARD_KEYS = new Set([
  "number",
  "card_number",
  "pan",
  "cvv",
  "cvc",
  "security_code",
  "first6",
  "first_6",
  "expiry_month",
  "expiry_year",
  "issuer_name",
]);

export function paymentDocumentVersionData() {
  return currentLegalDocumentVersionSnapshot();
}

export function withPaymentPolicyMetadata<T extends Record<string, unknown>>(metadata: T): T & {
  currency: typeof BILLING_CURRENCY;
  ruOnlyPaymentPolicy: true;
  offerVersion: string;
  termsVersion: string;
  consentVersion: string;
} {
  return {
    ...metadata,
    currency: BILLING_CURRENCY,
    ruOnlyPaymentPolicy: true,
    ...paymentDocumentVersionData(),
  };
}

export function assertRubPaymentAmount(payment: ProviderPaymentLike | { currency?: string | null }) {
  const currency = (payment as ProviderPaymentLike).amount?.currency
    ?? (payment as { currency?: string | null }).currency;
  if (currency && currency !== BILLING_CURRENCY) {
    throw new Error(`Unsupported payment currency: ${currency}`);
  }
}

export function normalizePaymentDeclineReason(payment: ProviderPaymentLike): PaymentDeclineReason | null {
  const status = payment.status?.toLowerCase();
  const providerReason = payment.cancellation_details?.reason?.toLowerCase() ?? "";
  const issuerCountry = payment.payment_method?.card?.issuer_country?.toUpperCase() ?? "";

  if (issuerCountry && issuerCountry !== "RU") return "ru_payment_method_required";
  if (FOREIGN_CARD_PROVIDER_REASONS.has(providerReason)) return "ru_payment_method_required";
  if (providerReason.includes("restricted")) return "provider_payment_restricted";
  if (status === "canceled" || status === "cancelled") return "provider_payment_canceled";
  return null;
}

export function paymentDeclineUserMessage(reason: PaymentDeclineReason | null | undefined) {
  if (reason === "ru_payment_method_required") return RU_ONLY_PAYMENT_DECLINE_MESSAGE;
  if (reason === "provider_payment_restricted") return "Платёж отклонён платёжным провайдером. Попробуйте другой российский способ оплаты.";
  if (reason === "provider_payment_canceled") return "Платёж отменён. Попробуйте снова или выберите другой способ оплаты.";
  return "Платёж не прошёл. Попробуйте снова или выберите другой способ оплаты.";
}

export function sanitizePaymentProviderPayload(value: unknown): Prisma.InputJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePaymentProviderPayload(item)) as Prisma.InputJsonArray;
  }
  if (!value || typeof value !== "object") {
    return (value ?? null) as Prisma.InputJsonValue;
  }

  const sanitized: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (SENSITIVE_CARD_KEYS.has(normalizedKey)) {
      sanitized[key] = "[redacted]";
      continue;
    }
    sanitized[key] = sanitizePaymentProviderPayload(raw);
  }
  return sanitized as Prisma.InputJsonObject;
}
