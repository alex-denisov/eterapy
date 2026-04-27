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
import { NextRequest } from "next/server";
import { applyPaymentResult } from "@/lib/billing-credit";
import { jsonWithRequestContext } from "@/lib/api-response";
import { log } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";

const YUKASSA_SHOP_ID = process.env.YUKASSA_SHOP_ID;
const YUKASSA_SECRET_KEY = process.env.YUKASSA_SECRET_KEY;

function verifyYookassaAuth(req: NextRequest, requestId: string): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return false;
  }

  if (!YUKASSA_SHOP_ID || !YUKASSA_SECRET_KEY) {
    // In development, allow without auth if env vars are missing
    log.warn("yookassa-webhook-auth-skipped", {
      requestId,
      reason: "missing-env",
    });
    return true;
  }

  const expected = `Basic ${Buffer.from(`${YUKASSA_SHOP_ID}:${YUKASSA_SECRET_KEY}`).toString("base64")}`;
  return authHeader === expected;
}

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);

  if (!verifyYookassaAuth(req, context.requestId)) {
    log.warn("yookassa-webhook-unauthorized", {
      requestId: context.requestId,
      hasAuthorization: Boolean(req.headers.get("authorization")),
    });
    return jsonWithRequestContext({ error: "Unauthorized" }, { status: 401 }, context);
  }

  const body = await req.json();
  const event = body.event; // "payment.succeeded", "payment.canceled"
  const payment = body.object;

  if (!payment?.id) {
    log.warn("yookassa-webhook-invalid-payload", {
      requestId: context.requestId,
      event,
    });
    return jsonWithRequestContext({ error: "Invalid webhook payload" }, { status: 400 }, context);
  }

  log.info("yookassa-webhook-received", {
    requestId: context.requestId,
    event,
    providerPaymentId: payment.id,
  });

  const result = await applyPaymentResult(payment);
  log.info("yookassa-webhook-applied", {
    requestId: context.requestId,
    event,
    providerPaymentId: payment.id,
    result,
  });

  return jsonWithRequestContext({ ok: true, result }, undefined, context);
}
