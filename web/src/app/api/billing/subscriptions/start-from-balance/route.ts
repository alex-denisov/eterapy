import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { requestContextFromHeaders } from "@/lib/request-context";
import { getSubscriptionPlan } from "@/lib/entitlements";
import { log, serializeError } from "@/lib/logger";
import { Prisma } from "@prisma/client";

/**
 * POST /api/billing/subscriptions/start-from-balance
 *
 * Activates a subscription for the signed-in user using their on-platform
 * balance instead of routing through YooKassa. Used by the cabinet billing
 * page so users with enough balance can subscribe without re-entering card
 * details.
 *
 * Atomic semantics:
 *   - reads the latest balance inside a transaction,
 *   - if balance < plan price → returns 402 with code INSUFFICIENT_BALANCE,
 *   - decrements the balance by the plan amount,
 *   - records a Transaction (kind=subscription, status=SUCCEEDED),
 *   - upserts UserSubscription with status ACTIVE + currentPeriodEnd in 30 days.
 */
export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  let payload: { planKey?: unknown; checkoutSource?: unknown };
  try {
    payload = await request.json();
  } catch {
    return errorWithRequestContext("BAD_REQUEST", "Invalid JSON", 400, context);
  }

  const planKey = typeof payload.planKey === "string" ? payload.planKey.trim() : "";
  const plan = getSubscriptionPlan(planKey);
  if (!plan) {
    return errorWithRequestContext("BAD_REQUEST", "Unknown plan", 400, context);
  }
  const checkoutSource = typeof payload.checkoutSource === "string" ? payload.checkoutSource : "client_billing_balance";

  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { balance: true } });
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.balance < plan.amountKopecks) {
        return { ok: false as const, code: "INSUFFICIENT_BALANCE", balance: user.balance, required: plan.amountKopecks };
      }

      // Existing active subscription? Don't double-charge — refuse instead.
      const active = await tx.userSubscription.findFirst({
        where: {
          userId,
          status: { in: ["TRIALING", "ACTIVE"] },
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
        },
        select: { id: true, planKey: true },
      });
      if (active && active.planKey === planKey) {
        return { ok: false as const, code: "ALREADY_ACTIVE", subscriptionId: active.id };
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: plan.amountKopecks } },
        select: { balance: true },
      });

      const transaction = await tx.transaction.create({
        data: {
          userId,
          amount: plan.amountKopecks,
          status: "SUCCEEDED",
          metadata: {
            purchaseKind: "subscription",
            planKey,
            checkoutSource,
          } as Prisma.InputJsonObject,
        },
      });

      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      // No (userId, planKey) unique constraint, so reuse the most recent
      // row for this plan (if any) or create a fresh ACTIVE one.
      const existing = await tx.userSubscription.findFirst({
        where: { userId, planKey },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const subscription = existing
        ? await tx.userSubscription.update({
            where: { id: existing.id },
            data: {
              status: "ACTIVE",
              cancelAtPeriodEnd: false,
              currentPeriodEnd: periodEnd,
            },
            select: { id: true, planKey: true, currentPeriodEnd: true, status: true },
          })
        : await tx.userSubscription.create({
            data: {
              userId,
              planKey,
              status: "ACTIVE",
              currentPeriodEnd: periodEnd,
            },
            select: { id: true, planKey: true, currentPeriodEnd: true, status: true },
          });

      return {
        ok: true as const,
        balance: updated.balance,
        transactionId: transaction.id,
        subscription,
      };
    });

    if (!result.ok) {
      const status = result.code === "INSUFFICIENT_BALANCE" ? 402 : 409;
      return errorWithRequestContext(result.code, result.code, status, context);
    }

    return jsonWithRequestContext(result, undefined, context);
  } catch (error) {
    log.warn("subscription-start-from-balance-failed", { userId, planKey, error: serializeError(error) });
    return errorWithRequestContext("INTERNAL_ERROR", "Failed to activate subscription", 500, context);
  }
}
