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
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch } from "@/lib/yukassa";
import { applyPaymentResult } from "@/lib/billing-credit";

// Only look at the last 30 minutes — older PENDING rows are almost certainly dead.
const LOOKBACK_MS = 30 * 60 * 1000;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const results: Array<{ providerPaymentId: string; outcome: "credited" | "cancelled" | "noop" | "error" }> = [];

  for (const t of pending) {
    if (!t.providerPaymentId) continue;
    try {
      const payment = await yukassaFetch<{
        id: string;
        status: string;
        paid: boolean;
        payment_method?: {
          id: string;
          saved?: boolean;
          card?: { last4: string; card_type: string; expiry_month: string; expiry_year: string };
        };
      }>(`/payments/${t.providerPaymentId}`);
      const outcome = await applyPaymentResult(payment);
      results.push({ providerPaymentId: t.providerPaymentId, outcome });
    } catch (err) {
      console.error(`[billing/reconcile] failed for ${t.providerPaymentId}:`, err);
      results.push({ providerPaymentId: t.providerPaymentId, outcome: "error" });
    }
  }

  return NextResponse.json({ ok: true, reconciled: results.length, results });
}
