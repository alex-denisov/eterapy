import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch } from "@/lib/yukassa";
import { applyPaymentResult } from "@/lib/billing-credit";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { logAudit } from "@/lib/audit";

type ProviderPayment = {
  id: string;
  status: string;
  paid?: boolean;
  amount?: { currency?: string };
  cancellation_details?: { party?: string; reason?: string };
  payment_method?: {
    id: string;
    saved?: boolean;
    card?: {
      first6?: string;
      last4?: string;
      card_type?: string;
      expiry_month?: string;
      expiry_year?: string;
      issuer_country?: string;
    };
  };
};

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const payload = await req.json().catch(() => null) as { transactionIds?: unknown } | null;
  const transactionIds = Array.isArray(payload?.transactionIds)
    ? payload.transactionIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).slice(0, 50)
    : [];

  if (transactionIds.length === 0) {
    return errorWithRequestContext("BAD_REQUEST", "Не выбраны операции для проверки", 400, context);
  }

  const transactions = await db.transaction.findMany({
    where: {
      id: { in: transactionIds },
      provider: "yookassa",
      providerPaymentId: { not: null },
    },
    select: {
      id: true,
      providerPaymentId: true,
      status: true,
    },
  });

  const results: Array<{
    transactionId: string;
    providerPaymentId: string;
    providerStatus?: string;
    localStatus: string;
    outcome: "credited" | "cancelled" | "card_verified" | "noop" | "error";
    error?: string;
  }> = [];

  for (const transaction of transactions) {
    if (!transaction.providerPaymentId) continue;
    try {
      const payment = await yukassaFetch<ProviderPayment>(`/payments/${transaction.providerPaymentId}`);
      const outcome = await applyPaymentResult(payment);
      results.push({
        transactionId: transaction.id,
        providerPaymentId: transaction.providerPaymentId,
        providerStatus: payment.status,
        localStatus: transaction.status,
        outcome,
      });
    } catch (error) {
      log.error("admin-finance-provider-check-failed", {
        requestId: context.requestId,
        adminId: session.user.id,
        transactionId: transaction.id,
        providerPaymentId: transaction.providerPaymentId,
        error: serializeError(error),
      });
      results.push({
        transactionId: transaction.id,
        providerPaymentId: transaction.providerPaymentId,
        localStatus: transaction.status,
        outcome: "error",
        error: error instanceof Error ? error.message : "Ошибка проверки у провайдера",
      });
    }
  }

  await logAudit(
    session.user.id,
    "FINANCE_PROVIDER_CHECK",
    undefined,
    JSON.stringify({
      requested: transactionIds.length,
      checked: results.length,
      errors: results.filter((result) => result.outcome === "error").length,
    }),
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return jsonWithRequestContext({
    ok: true,
    requested: transactionIds.length,
    checked: results.length,
    skipped: transactionIds.length - transactions.length,
    results,
  }, undefined, context);
}
