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
import { applyPaymentResult } from "@/lib/billing-credit";
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
  const shopId = process.env.YUKASSA_SHOP_ID;
  const secretKey = process.env.YUKASSA_SECRET_KEY;
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
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
  return safeEqual(authHeader, expected);
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
    const result = await applyPaymentResult({
      id: payment.id,
      status: typeof payment.status === "string" ? payment.status : undefined,
      paid: typeof payment.paid === "boolean" ? payment.paid : undefined,
      payment_method: asRecord(payment.payment_method) as never,
    });
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
