import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { getSubscriptionPlan, V5_SUBSCRIPTION_PLANS } from "@/lib/entitlements";
import { notify } from "@/lib/notifications";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const subscriptions = await db.userSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return jsonWithRequestContext({
    plans: Object.entries(V5_SUBSCRIPTION_PLANS).map(([key, plan]) => ({
      key,
      name: plan.name,
      amountKopecks: plan.amountKopecks,
      trialDays: plan.trialDays,
      includedProducts: plan.includedProducts,
    })),
    subscriptions,
  }, undefined, context);
}

export async function PATCH(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const body = await req.json().catch(() => null) as { subscriptionId?: string; action?: string } | null;
  if (!body?.subscriptionId || body.action !== "cancel_at_period_end") {
    return errorWithRequestContext("INVALID_SUBSCRIPTION_ACTION", "Некорректное действие с подпиской", 400, context);
  }

  const subscription = await db.userSubscription.findFirst({
    where: { id: body.subscriptionId, userId: session.user.id },
  });
  if (!subscription || !getSubscriptionPlan(subscription.planKey)) {
    return errorWithRequestContext("SUBSCRIPTION_NOT_FOUND", "Подписка не найдена", 404, context);
  }

  const updated = await db.userSubscription.update({
    where: { id: subscription.id },
    data: {
      status: subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date() ? subscription.status : "CANCELLED",
      cancelAtPeriodEnd: true,
      cancelledAt: new Date(),
    },
  });

  notify({
    userId: session.user.id,
    event: "SUBSCRIPTION_CANCELLED",
    data: { planKey: updated.planKey },
    requestId: context.requestId,
  }).catch(() => {});

  return jsonWithRequestContext({ ok: true, subscription: updated }, undefined, context);
}
