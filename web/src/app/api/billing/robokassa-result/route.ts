/**
 * Robokassa ResultURL — the ONLY endpoint that may credit a user.
 *
 * Robokassa calls it server-to-server after a successful payment, signing the
 * callback with password #2 (which never leaves the server, unlike password #1
 * used for SuccessURL). It retries until the body is exactly `OK{InvId}`, so
 * every terminal outcome — including an already-processed duplicate — must
 * answer with that acknowledgement or the retries never stop.
 *
 * Crediting itself is delegated to `billing-credit.ts`, shared with the legacy
 * YooKassa webhook and `/api/billing/reconcile`.
 */
import { NextRequest } from "next/server";
import { creditSucceededPayment } from "@/lib/billing-credit";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/webhook-idempotency";
import { robokassaConfig } from "@/lib/payments/config";
import {
  parseCallback,
  parseOutSumToKopecks,
  resultAcknowledgement,
  verifyResultSignature,
} from "@/lib/payments/robokassa";

/** Robokassa reads the acknowledgement as plain text, not JSON. */
function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function callbackParams(req: NextRequest): Promise<URLSearchParams> {
  if (req.method === "GET") {
    return req.nextUrl.searchParams;
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return new URLSearchParams(await req.text());
  }
  // Robokassa posts form-encoded, but query params are still populated when the
  // shop is (mis)configured for GET — accept both rather than lose a payment.
  const body = await req.text().catch(() => "");
  const merged = new URLSearchParams(req.nextUrl.searchParams);
  for (const [key, value] of new URLSearchParams(body).entries()) {
    merged.set(key, value);
  }
  return merged;
}

async function handle(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const params = await callbackParams(req);
  const callback = parseCallback(params);

  if (!callback) {
    log.warn("robokassa-result-invalid-payload", { requestId: context.requestId });
    return text("bad request", 400);
  }

  const { invId, outSum, signatureValue, shp } = callback;

  // B571: транзакция читается ДО проверки подписи, потому что она хранит режим
  // кассы, а от режима зависит пароль #2, которым подписан этот колбэк.
  // Проверить боевым паролем тестовый платёж — значит отвергнуть законную
  // оплату, а пользователь останется без купленного.
  const transaction = await db.transaction.findUnique({ where: { invoiceId: invId } });
  if (!transaction) {
    log.error("robokassa-result-unknown-invoice", { requestId: context.requestId, invId });
    return text("unknown invoice", 404);
  }

  let config;
  try {
    config = robokassaConfig({ testMode: transaction.testMode });
  } catch (err) {
    log.error("robokassa-result-not-configured", {
      requestId: context.requestId,
      invId,
      error: serializeError(err),
    });
    // 500 (not OK) so Robokassa retries once the credentials are in place.
    return text("not configured", 500);
  }

  if (!verifyResultSignature({ config, outSum, invId, signatureValue, shp })) {
    log.error("robokassa-result-bad-signature", {
      requestId: context.requestId,
      invId,
      testMode: transaction.testMode,
    });
    return text("bad signature", 403);
  }

  // The signature covers OutSum, so a mismatch here means Robokassa charged an
  // amount our record does not know about. Never credit on that.
  const paidKopecks = parseOutSumToKopecks(outSum);
  if (paidKopecks !== transaction.amount) {
    log.error("robokassa-result-amount-mismatch", {
      requestId: context.requestId,
      invId,
      expectedKopecks: transaction.amount,
      paidKopecks,
    });
    return text("amount mismatch", 409);
  }

  const claim = await claimWebhookEvent({
    provider: "robokassa",
    eventId: `result:${invId}`,
    eventType: "payment.result",
    resourceId: String(invId),
    // Only protocol fields are stored — no card data ever reaches us.
    payload: { invId, outSum, fee: callback.fee, paymentMethod: callback.paymentMethod },
    requestId: context.requestId,
  });
  if (!claim.claimed || !claim.event) {
    // Already handled — acknowledge so Robokassa stops retrying.
    return text(resultAcknowledgement(invId));
  }

  try {
    const applied = await creditSucceededPayment(String(invId));
    await completeWebhookEvent(claim.event.id, { result: applied ? "credited" : "noop" });
    log.info("robokassa-result-applied", {
      requestId: context.requestId,
      invId,
      result: applied ? "credited" : "noop",
    });
    return text(resultAcknowledgement(invId));
  } catch (err) {
    await failWebhookEvent(claim.event.id, err).catch((updateErr) => {
      log.error("robokassa-result-fail-update-failed", {
        requestId: context.requestId,
        invId,
        error: serializeError(updateErr),
      });
    });
    log.error("robokassa-result-failed", {
      requestId: context.requestId,
      invId,
      error: serializeError(err),
    });
    // Withhold the acknowledgement so Robokassa retries the callback.
    return text("processing error", 500);
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
