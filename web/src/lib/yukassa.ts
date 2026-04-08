
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

// ─── Config ────────────────────────────────────────────────────────────────────

const SHOP_ID = process.env.YUKASSA_SHOP_ID;
const SECRET_KEY = process.env.YUKASSA_SECRET_KEY;

if (!SHOP_ID || !SECRET_KEY) {
  throw new Error("YUKASSA_SHOP_ID and YUKASSA_SECRET_KEY must be set in environment");
}

const API_URL = "https://api.yookassa.ru/v3";

const authHeader = `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64")}`;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function kopecksToRUB(kopecks: number): string {
  // Minimum amount is 100 kopecks (1 RUB) in test mode
  const amount = Math.max(kopecks, 100);
  return (amount / 100).toFixed(2);
}

async function yukassaFetch<T>(
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
