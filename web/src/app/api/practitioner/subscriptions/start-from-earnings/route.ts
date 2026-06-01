import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { getSubscriptionPlan } from "@/lib/entitlements";
import { log, serializeError } from "@/lib/logger";
import { computePractitionerBalance } from "@/lib/practitioner-balance";
import { requestContextFromHeaders } from "@/lib/request-context";

/**
 * POST /api/practitioner/subscriptions/start-from-earnings
 *
 * Activates Practitioner Pro/Pro+ using accrued practitioner earnings rather
 * than the client wallet balance. The charge is recorded as an internal
 * successful transaction and deducted from `computePractitionerBalance()` via
 * metadata.checkoutSource = "practitioner_earnings_balance".
 */
export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || session.user?.role !== "PRACTITIONER") {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  let payload: { planKey?: unknown };
  try {
    payload = await request.json();
  } catch {
    return errorWithRequestContext("BAD_REQUEST", "Invalid JSON", 400, context);
  }

  const planKey = typeof payload.planKey === "string" ? payload.planKey.trim() : "";
  const plan = getSubscriptionPlan(planKey);
  if (!plan || !planKey.startsWith("practitioner_pro")) {
    return errorWithRequestContext("BAD_REQUEST", "Unknown practitioner plan", 400, context);
  }

  try {
    const practitioner = await db.practitioner.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!practitioner) {
      return errorWithRequestContext("NOT_FOUND", "Practitioner profile not found", 404, context);
    }

    const balance = await computePractitionerBalance(practitioner.id);
    const availableKopecks = Math.max(0, balance?.currentBalance ?? 0) * 100;
    if (availableKopecks < plan.amountKopecks) {
      return errorWithRequestContext("INSUFFICIENT_EARNINGS", "Insufficient practitioner earnings", 402, context);
    }

    const result = await db.$transaction(async (tx) => {
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

      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const transaction = await tx.transaction.create({
        data: {
          userId,
          amount: plan.amountKopecks,
          status: "SUCCEEDED",
          provider: "internal",
          description: `${plan.name}: оплата из дохода практика`,
          metadata: {
            purchaseKind: "subscription",
            planKey,
            checkoutSource: "practitioner_earnings_balance",
          } as Prisma.InputJsonObject,
        },
        select: { id: true },
      });

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
              provider: "internal",
              cancelAtPeriodEnd: false,
              currentPeriodEnd: periodEnd,
              metadata: {
                paidFrom: "practitioner_earnings",
                transactionId: transaction.id,
              } as Prisma.InputJsonObject,
            },
            select: { id: true, planKey: true, currentPeriodEnd: true, status: true },
          })
        : await tx.userSubscription.create({
            data: {
              userId,
              planKey,
              status: "ACTIVE",
              provider: "internal",
              currentPeriodEnd: periodEnd,
              metadata: {
                paidFrom: "practitioner_earnings",
                transactionId: transaction.id,
              } as Prisma.InputJsonObject,
            },
            select: { id: true, planKey: true, currentPeriodEnd: true, status: true },
          });

      return { ok: true as const, transactionId: transaction.id, subscription };
    });

    if (!result.ok) {
      return errorWithRequestContext(result.code, result.code, 409, context);
    }

    return jsonWithRequestContext(result, undefined, context);
  } catch (error) {
    log.warn("practitioner-subscription-start-from-earnings-failed", {
      requestId: context.requestId,
      userId,
      planKey,
      error: serializeError(error),
    });
    return errorWithRequestContext("INTERNAL_ERROR", "Failed to activate practitioner subscription", 500, context);
  }
}
