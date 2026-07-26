/**
 * POST /api/billing/reconcile
 *
 * Called by the billing page when the user returns from YooKassa (?payment=success or
 * ?payment=card-saved). Iterates the user's PENDING YooKassa transactions, queries
 * YooKassa for the authoritative status, and credits/cancels accordingly.
 *
 * This covers two webhook-miss scenarios:
 *   1. Webhook delivery delay (user sees stale balance for several seconds).
 *   2. Webhook never arrived (e.g. notification_url misconfigured, RU-DC egress).
 *
 * Idempotent — uses the shared credit helper, which guards on transaction.status === PENDING.
 * Only reconciles transactions belonging to the authenticated user, so no impersonation.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch } from "@/lib/yukassa";
import { applyPaymentResult } from "@/lib/billing-credit";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { normalizePaymentDeclineReason, paymentDeclineUserMessage } from "@/lib/billing-policy";
import { reconcileRobokassaForUser } from "@/lib/payments/reconcile-robokassa";

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const since = new Date(Date.now() - LOOKBACK_MS);
  const pending = await db.transaction.findMany({
    where: {
      userId: session.user.id,
      status: "PENDING",
      provider: "yookassa",
      providerPaymentId: { not: null },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const results: Array<{
    providerPaymentId: string;
    outcome: "credited" | "cancelled" | "card_verified" | "noop" | "error";
    declineReason?: string | null;
    message?: string | null;
  }> = [];

  for (const t of pending) {
    if (!t.providerPaymentId) continue;
    try {
      const payment = await yukassaFetch<{
        id: string;
        status: string;
        paid: boolean;
        amount?: { currency?: string };
        cancellation_details?: { party?: string; reason?: string };
        payment_method?: {
          id: string;
          saved?: boolean;
          card?: { last4: string; card_type: string; expiry_month: string; expiry_year: string; issuer_country?: string };
        };
      }>(`/payments/${t.providerPaymentId}`);
      const outcome = await applyPaymentResult(payment);
      const declineReason = outcome === "cancelled" ? normalizePaymentDeclineReason(payment) : null;
      results.push({
        providerPaymentId: t.providerPaymentId,
        outcome,
        declineReason,
        message: declineReason ? paymentDeclineUserMessage(declineReason) : null,
      });
    } catch (err) {
      log.error("billing-reconcile-payment-failed", {
        requestId: context.requestId,
        userId: session.user.id,
        providerPaymentId: t.providerPaymentId,
        error: serializeError(err),
      });
      results.push({ providerPaymentId: t.providerPaymentId, outcome: "error" });
    }
  }

  // INC-081: боевой провайдер — Robokassa, и до этого места сверка его не
  // видела вовсе. Ровно поэтому «Подтверждаем оплату и открываем доступ…»
  // висело вечно: страница шесть раз спрашивала сверку об оплате, которую та
  // не умела искать.
  const robokassa = await reconcileRobokassaForUser(session.user.id);
  for (const item of robokassa) {
    results.push({
      providerPaymentId: String(item.invoiceId),
      outcome: item.outcome === "credited"
        ? "credited"
        : item.outcome === "cancelled"
          ? "cancelled"
          : item.outcome === "error"
            ? "error"
            : "noop",
      declineReason: item.outcome === "cancelled" ? "provider_payment_canceled" : null,
      message: item.outcome === "cancelled" ? paymentDeclineUserMessage("provider_payment_canceled") : null,
    });
  }

  log.info("billing-reconcile-completed", {
    requestId: context.requestId,
    userId: session.user.id,
    pendingCount: pending.length + robokassa.length,
    reconciled: results.length,
    outcomes: results.map((result) => result.outcome),
  });

  return jsonWithRequestContext({ ok: true, reconciled: results.length, results }, undefined, context);
}
