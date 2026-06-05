
import { YUKASSA_API_URL } from "@/lib/env";

export type YukassaPaymentStatus =
  | "pending"
  | "waiting_for_capture"
  | "succeeded"
  | "canceled";

export interface YukassaPayment {
  id: string;
  status: YukassaPaymentStatus;
  paid: boolean;
  amount: {
    value: string; // decimal string, e.g. "123.45"
    currency: string;
  };
  confirmationUrl?: string;
  metadata?: {
    bookingId: string;
  };
}

export interface CreatePaymentOptions {
  amountKopecks: number;
  bookingId: string;
  returnUrl: string;
  description: string;
}

export interface GetPaymentOptions {
  externalId: string;
}

export interface CreateRefundOptions {
  paymentId: string;
  amountKopecks: number;
}

export interface CreatePaymentWithSaveMethodOptions {
  amountKopecks: number;
  customerId: string; // user id to link saved payment method
  returnUrl: string;
  description: string;
}

export interface YooKassaPaymentMethod {
  id: string;
  saved: boolean;
  title: string; // e.g. "Bank card *1234"
  status: "waiting_for_capture" | "succeeded" | "canceled";
  card?: {
    first6: string;
    last4: string;
    expiry_month: string;
    expiry_year: string;
    card_type: string; // "Visa", "MasterCard", "Mir"
    card_product?: {
      code: string;
      name: string;
    };
    issuer_country?: string;
    issuer_name?: string;
  };
  customer_id: string;
  metadata?: Record<string, string>;
}

// ─── Config ────────────────────────────────────────────────────────────────────

const SHOP_ID = process.env.YUKASSA_SHOP_ID;
const SECRET_KEY = process.env.YUKASSA_SECRET_KEY;

const API_URL = YUKASSA_API_URL;

function getAuthHeader() {
  if (!SHOP_ID || !SECRET_KEY) {
    throw new Error("YUKASSA_SHOP_ID and YUKASSA_SECRET_KEY must be set in environment");
  }
  return `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64")}`;
}

// Lazy-initialized - only created when first accessed
let _authHeader: string | null = null;
function getAuthHeaderLazy() {
  if (!_authHeader) {
    _authHeader = getAuthHeader();
  }
  return _authHeader;
}

// For backward compatibility - will be set on first use
const authHeader = getAuthHeaderLazy();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function kopecksToRUB(kopecks: number): string {
  // Minimum amount is 100 kopecks (1 RUB) in test mode
  const amount = Math.max(kopecks, 100);
  return (amount / 100).toFixed(2);
}

export async function yukassaFetch<T>(
  endpoint: string,
  {
    method = "GET",
    body,
    idempotenceKey,
  }: {
    method?: string;
    body?: unknown;
    idempotenceKey?: string;
  } = {}
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: authHeader,
    "Idempotence-Key": idempotenceKey || crypto.randomUUID(),
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `YuKassa API error ${response.status}: ${response.statusText}. Body: ${errorBody}`
    );
  }

  // 204 No Content for some DELETE operations
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a payment in YuKassa.
 *
 * - Amount is in kopecks (RUB * 100)
 * - Idempotence-Key is set to bookingId to prevent duplicate payments
 * - Returns payment with confirmationUrl for redirect
 */
export async function createPayment({
  amountKopecks,
  bookingId,
  returnUrl,
  description,
}: CreatePaymentOptions): Promise<YukassaPayment> {
  const amountValue = kopecksToRUB(amountKopecks);

  return yukassaFetch<YukassaPayment>("/payments", {
    method: "POST",
    idempotenceKey: bookingId,
    body: {
      amount: {
        value: amountValue,
        currency: "RUB",
      },
      confirmation: {
        type: "redirect",
        return_url: returnUrl,
      },
      description,
      metadata: {
        bookingId,
      },
    },
  });
}

/**
 * Get payment by YuKassa payment ID (externalId).
 */
export async function getPayment({ externalId }: GetPaymentOptions): Promise<YukassaPayment> {
  return yukassaFetch<YukassaPayment>(`/payments/${externalId}`);
}

// ─── Two-stage (hold / capture / cancel) — Z1a card-session payment ──────────────
//
// Sessions use a two-stage YooKassa payment: at booking the funds are AUTHORIZED
// (capture: false → status `waiting_for_capture`, "hold"), and only CAPTURED when
// the session is delivered, or CANCELLED (hold released) on cancellation/no-show.
//
// NB: a YooKassa card hold lives ~7 days. The orchestration (session-payment.ts)
// must capture or cancel within that window — i.e. hold close to the session, not
// weeks ahead. Booking lead-time policy is enforced by the caller.

export interface CreateTwoStagePaymentOptions {
  amountKopecks: number;
  bookingId: string;
  returnUrl: string;
  description: string;
}

export interface CreateTwoStageFromSavedMethodOptions {
  amountKopecks: number;
  bookingId: string;
  paymentMethodId: string;
  customerId: string;
  description: string;
}

/**
 * Create a two-stage (hold) payment with a NEW card via redirect.
 * Funds are authorized (status `waiting_for_capture`) but NOT captured until
 * {@link capturePayment}. Idempotent per booking (`hold-{bookingId}`).
 */
export async function createTwoStagePayment({
  amountKopecks,
  bookingId,
  returnUrl,
  description,
}: CreateTwoStagePaymentOptions): Promise<YukassaPayment> {
  return yukassaFetch<YukassaPayment>("/payments", {
    method: "POST",
    idempotenceKey: `hold-${bookingId}`,
    body: {
      amount: { value: kopecksToRUB(amountKopecks), currency: "RUB" },
      confirmation: { type: "redirect", return_url: returnUrl },
      capture: false,
      description,
      metadata: { bookingId, kind: "session_hold" },
    },
  });
}

/**
 * Create a two-stage (hold) payment with a previously SAVED card (no redirect).
 * Funds are authorized but not captured. Idempotent per booking.
 */
export async function createTwoStagePaymentFromSavedMethod({
  amountKopecks,
  bookingId,
  paymentMethodId,
  customerId,
  description,
}: CreateTwoStageFromSavedMethodOptions): Promise<YukassaPayment> {
  return yukassaFetch<YukassaPayment>("/payments", {
    method: "POST",
    idempotenceKey: `hold-${bookingId}`,
    body: {
      amount: { value: kopecksToRUB(amountKopecks), currency: "RUB" },
      capture: false,
      payment_method_id: paymentMethodId,
      customer_id: customerId,
      description,
      metadata: { bookingId, kind: "session_hold" },
    },
  });
}

/**
 * Capture a held (`waiting_for_capture`) payment → money is charged.
 * Optional `amountKopecks` performs a partial capture (defaults to the full
 * authorized amount). Idempotent per payment (`capture-{paymentId}`).
 */
export async function capturePayment(
  paymentId: string,
  amountKopecks?: number,
): Promise<YukassaPayment> {
  const body = amountKopecks != null
    ? { amount: { value: kopecksToRUB(amountKopecks), currency: "RUB" } }
    : {};
  return yukassaFetch<YukassaPayment>(`/payments/${paymentId}/capture`, {
    method: "POST",
    idempotenceKey: `capture-${paymentId}`,
    body,
  });
}

/**
 * Cancel a held (`waiting_for_capture`) payment → releases the hold, no charge.
 * Idempotent per payment (`cancel-{paymentId}`).
 */
export async function cancelPayment(paymentId: string): Promise<YukassaPayment> {
  return yukassaFetch<YukassaPayment>(`/payments/${paymentId}/cancel`, {
    method: "POST",
    idempotenceKey: `cancel-${paymentId}`,
  });
}

/**
 * Create a refund for a payment.
 *
 * - Idempotence-Key is `refund-{paymentId}` to prevent duplicate refunds
 * - Amount in kopecks (partial refunds allowed)
 */
export async function createRefund({
  paymentId,
  amountKopecks,
}: CreateRefundOptions): Promise<{ id: string; status: string }> {
  const amountValue = kopecksToRUB(amountKopecks);

  return yukassaFetch<{ id: string; status: string }>(`/payments/${paymentId}/refunds`, {
    method: "POST",
    idempotenceKey: `refund-${paymentId}`,
    body: {
      amount: {
        value: amountValue,
        currency: "RUB",
      },
    },
  });
}

/**
 * Create a payment with save_payment_method=true.
 * After successful payment, the payment method is saved and can be reused.
 * Returns payment with confirmationUrl for redirect.
 */
export async function createPaymentWithSaveMethod({
  amountKopecks,
  customerId,
  returnUrl,
  description,
}: CreatePaymentWithSaveMethodOptions): Promise<YukassaPayment> {
  const amountValue = kopecksToRUB(amountKopecks);

  return yukassaFetch<YukassaPayment>("/payments", {
    method: "POST",
    body: {
      amount: {
        value: amountValue,
        currency: "RUB",
      },
      confirmation: {
        type: "redirect",
        return_url: returnUrl,
      },
      capture: true,
      save_payment_method: true,
      customer_id: customerId,
      description,
      metadata: {
        customerId,
        saveMethod: "true",
      },
    },
  });
}

/**
 * Create a payment using a previously saved payment method.
 * This is a quick charge without redirect — the payment is captured immediately.
 */
export async function createPaymentFromSavedMethod(
  paymentMethodId: string,
  amountKopecks: number,
  customerId: string,
  description: string
): Promise<YukassaPayment> {
  const amountValue = kopecksToRUB(amountKopecks);

  return yukassaFetch<YukassaPayment>("/payments", {
    method: "POST",
    body: {
      amount: {
        value: amountValue,
        currency: "RUB",
      },
      capture: true,
      payment_method_id: paymentMethodId,
      customer_id: customerId,
      description,
    },
  });
}

/**
 * List saved payment methods for a customer.
 */
export async function listSavedPaymentMethods(
  customerId: string
): Promise<{ payment_methods: YooKassaPaymentMethod[] }> {
  return yukassaFetch<{ payment_methods: YooKassaPaymentMethod[] }>(
    `/payment_methods?customer_id=${encodeURIComponent(customerId)}`
  );
}

/**
 * Delete (unbind) a saved payment method.
 */
export async function deleteSavedPaymentMethod(
  paymentMethodId: string
): Promise<{ status: string }> {
  return yukassaFetch<{ status: string }>(`/payment_methods/${paymentMethodId}`, {
    method: "DELETE",
  });
}
