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
import { timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";
import { applyPaymentResult, chargebackSucceededTransaction } from "@/lib/billing-credit";
import { jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/webhook-idempotency";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyYookassaAuth(req: NextRequest, requestId: string): boolean {
  const shopId = process.env.YUKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YUKASSA_SECRET_KEY?.trim();
  const authHeader = req.headers.get("authorization");
  
  if (!authHeader || !authHeader.toLowerCase().startsWith("basic ")) {
    log.warn("yookassa-webhook-no-basic-auth", { requestId, hasHeader: !!authHeader });
    return false;
  }

  if (!shopId || !secretKey) {
    log.warn("yookassa-webhook-auth-skipped", {
      requestId,
      reason: "missing-env",
      failClosed: process.env.NODE_ENV === "production",
    });
    return process.env.NODE_ENV !== "production";
  }

  const expected = `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`;
  // case-insensitive match for "Basic " prefix but sensitive for credentials
  const normalizedActual = "Basic " + authHeader.slice(6);
  const match = safeEqual(normalizedActual, expected);
  
  if (!match) {
    log.error("yookassa-webhook-auth-mismatch", { 
      requestId,
      shopIdConfigured: !!shopId,
      secretKeyConfigured: !!secretKey,
    });
  }
  
  return match;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

  const body = asRecord(await req.json().catch(() => null));
  const event = typeof body?.event === "string" ? body.event : "unknown";
  const payment = asRecord(body?.object);

  if (!body || !payment || typeof payment.id !== "string") {
    log.warn("yookassa-webhook-invalid-payload", {
      requestId: context.requestId,
      event,
    });
    return jsonWithRequestContext({ error: "Invalid webhook payload" }, { status: 400 }, context);
  }

  const paymentStatus = typeof payment.status === "string" ? payment.status : String(payment.paid ?? "unknown");
  const eventId = typeof body.id === "string"
    ? body.id
    : `${event}:${payment.id}:${paymentStatus}`;

  log.info("yookassa-webhook-received", {
    requestId: context.requestId,
    event,
    providerPaymentId: payment.id,
  });

  const claim = await claimWebhookEvent({
    provider: "yookassa",
    eventId,
    eventType: event,
    resourceId: payment.id,
    payload: body as Prisma.InputJsonObject,
    requestId: context.requestId,
  });
  if (!claim.claimed || !claim.event) {
    return jsonWithRequestContext({ ok: true, duplicate: true }, undefined, context);
  }

  try {
    let result: string;

    if (event === "refund.succeeded") {
      const originalPaymentId = typeof payment.payment_id === "string" ? payment.payment_id : null;
      if (!originalPaymentId) {
        log.warn("yookassa-webhook-refund-missing-payment-id", { requestId: context.requestId, refundId: payment.id });
        return jsonWithRequestContext({ ok: true, skipped: true }, undefined, context);
      }
      const { applied } = await chargebackSucceededTransaction({
        providerPaymentId: originalPaymentId,
        providerRefundId: payment.id,
        reason: "yookassa_refund",
      });
      result = applied ? "chargebacked" : "noop";
    } else {
      result = await applyPaymentResult({
        id: payment.id,
        status: typeof payment.status === "string" ? payment.status : undefined,
        paid: typeof payment.paid === "boolean" ? payment.paid : undefined,
        payment_method: asRecord(payment.payment_method) as never,
      });
    }

    await completeWebhookEvent(claim.event.id, { result });
    log.info("yookassa-webhook-applied", {
      requestId: context.requestId,
      event,
      providerPaymentId: payment.id,
      result,
    });

    return jsonWithRequestContext({ ok: true, result }, undefined, context);
  } catch (err) {
    await failWebhookEvent(claim.event.id, err).catch((updateErr) => {
      log.error("yookassa-webhook-fail-update-failed", {
        requestId: context.requestId,
        event,
        providerPaymentId: payment.id,
        error: serializeError(updateErr),
      });
    });
    throw err;
  }
}
