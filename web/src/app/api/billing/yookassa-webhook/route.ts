/**
 * POST /api/billing/yookassa-webhook
 * Webhook от ЮKassa для обновления статуса платежа.
 * ЮKassa отправляет события: payment.succeeded, payment.canceled и т.д.
 *
 * YooKassa authenticates webhooks via HTTP Basic Auth using shopId:secretKey.
 * We verify the Authorization header to ensure the request is legitimate.
 *
 * Crediting logic lives in `lib/billing-credit.ts` — shared with `/api/billing/reconcile`
 * so the UI can force a settlement when the user returns from YooKassa before the
 * webhook has arrived.
 */
import { NextRequest, NextResponse } from "next/server";
import { applyPaymentResult } from "@/lib/billing-credit";

const YUKASSA_SHOP_ID = process.env.YUKASSA_SHOP_ID;
const YUKASSA_SECRET_KEY = process.env.YUKASSA_SECRET_KEY;

function verifyYookassaAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return false;
  }

  if (!YUKASSA_SHOP_ID || !YUKASSA_SECRET_KEY) {
    // In development, allow without auth if env vars are missing
    console.warn("[yookassa-webhook] YUKASSA_SHOP_ID or YUKASSA_SECRET_KEY not set, skipping auth verification");
    return true;
  }

  const expected = `Basic ${Buffer.from(`${YUKASSA_SHOP_ID}:${YUKASSA_SECRET_KEY}`).toString("base64")}`;
  return authHeader === expected;
}

export async function POST(req: NextRequest) {
  if (!verifyYookassaAuth(req)) {
    console.error("[yookassa-webhook] Unauthorized — invalid or missing Basic Auth");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const event = body.event; // "payment.succeeded", "payment.canceled"
  const payment = body.object;

  if (!payment?.id) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  console.log(`[yookassa-webhook] Event: ${event}, Payment ID: ${payment.id}`);

  const result = await applyPaymentResult(payment);
  if (result === "credited") {
    console.log(`[yookassa-webhook] Credited payment ${payment.id}`);
  } else if (result === "cancelled") {
    console.log(`[yookassa-webhook] Cancelled payment ${payment.id}`);
  } else {
    console.log(`[yookassa-webhook] No-op for payment ${payment.id} (already settled or status unknown: ${event})`);
  }

  return NextResponse.json({ ok: true, result });
}
