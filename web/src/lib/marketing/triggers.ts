import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { absoluteMainUrl } from "@/lib/subdomain";
import { sendMarketingMessage } from "@/lib/marketing/dispatch";

const DAY = 86_400_000;

function dateRu(value: Date) {
  return value.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  });
}

function metadataString(value: Prisma.JsonValue | null, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function commonValues(name: string) {
  return {
    name: name?.trim() || "Здравствуйте",
    cta: absoluteMainUrl("/cabinet"),
    points: "баллы",
    date: "в указанную дату",
    service: "разбор ситуации",
    packs: "актуальные пакеты видны в кошельке",
    packCount: "несколько",
    spentRub: "—",
    planName: "подходящий тариф",
    planPriceRub: "актуальная цена указана в кошельке",
    nextPlanName: "следующий тариф",
    nextPlanQuota: "больше разборов",
    planDeltaRub: "указана в кошельке",
    inviteePoints: "приветственные баллы",
    inviterPoints: "реферальную награду",
    articleCount: "новые",
    articleList: "Новые материалы уже доступны в библиотеке.",
    serviceName: "новая услуга",
    serviceSummary: "Описание и стоимость доступны на странице услуги.",
    promoSubject: "Предложение ETerapy",
    promoBody: "В кабинете появилось новое предложение.",
    promoTerms: "Условия и срок действия указаны на странице предложения.",
  };
}

type Trigger = { eventKey: string; values: Record<string, string> };

export async function evaluateMarketingTriggerForUser(userId: string, now = new Date()): Promise<Trigger | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      clarityCreditLedgerEntries: {
        where: { status: { in: ["pending", "confirmed"] } },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      dialogues: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 2,
        select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
      },
      productResults: {
        where: { status: "READY", deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 2,
        select: { title: true, updatedAt: true },
      },
      subscriptions: {
        orderBy: { updatedAt: "desc" },
        take: 3,
      },
      transactions: {
        where: { status: "SUCCEEDED", createdAt: { gte: new Date(now.getTime() - 90 * DAY) } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { amount: true, metadata: true, createdAt: true },
      },
      referralsGiven: {
        orderBy: { updatedAt: "desc" },
        take: 2,
        select: { status: true, rewardGrantedAt: true },
      },
    },
  });
  if (!user) return null;
  const values = commonValues(user.name);

  const expiring = user.clarityCreditLedgerEntries.filter((entry) =>
    entry.amount > 0
    && entry.expiresAt
    && entry.expiresAt.getTime() >= now.getTime() + 13 * DAY
    && entry.expiresAt.getTime() <= now.getTime() + 15 * DAY
  );
  if (expiring.length > 0) {
    return {
      eventKey: "POINTS_EXPIRING",
      values: {
        ...values,
        points: `${expiring.reduce((sum, entry) => sum + entry.amount, 0)} баллов`,
        date: dateRu(expiring[0].expiresAt!),
        cta: absoluteMainUrl("/cabinet/wallet"),
      },
    };
  }

  const latestGrant = user.clarityCreditLedgerEntries.find((entry) => entry.amount > 0);
  const spentAfterGrant = latestGrant && user.clarityCreditLedgerEntries.some((entry) =>
    entry.amount < 0 && entry.createdAt > latestGrant.createdAt
  );
  if (latestGrant && !spentAfterGrant && latestGrant.createdAt <= new Date(now.getTime() - 3 * DAY)) {
    return {
      eventKey: "POINTS_GRANTED_UNUSED",
      values: {
        ...values,
        points: `${latestGrant.balanceAfter ?? latestGrant.amount} баллов`,
        cta: absoluteMainUrl("/cabinet/wallet"),
      },
    };
  }

  const rewarded = user.referralsGiven.find((row) =>
    row.status === "REWARDED"
    && row.rewardGrantedAt
    && row.rewardGrantedAt >= new Date(now.getTime() - 2 * DAY)
  );
  if (rewarded) {
    return {
      eventKey: "REFERRAL_REWARD_EARNED",
      values: { ...values, points: "реферальные баллы", cta: absoluteMainUrl("/cabinet/wallet") },
    };
  }

  const renewal = user.subscriptions.find((subscription) =>
    ["ACTIVE", "TRIALING"].includes(subscription.status)
    && subscription.cancelAtPeriodEnd
    && subscription.currentPeriodEnd
    && subscription.currentPeriodEnd >= new Date(now.getTime() + 4 * DAY)
    && subscription.currentPeriodEnd <= new Date(now.getTime() + 6 * DAY)
  );
  if (renewal?.currentPeriodEnd) {
    return {
      eventKey: "SUBSCRIPTION_RENEWAL_NUDGE",
      values: {
        ...values,
        planName: renewal.planKey,
        date: dateRu(renewal.currentPeriodEnd),
        cta: absoluteMainUrl("/cabinet/wallet"),
      },
    };
  }

  const lapsed = user.subscriptions.find((subscription) =>
    ["CANCELLED", "EXPIRED"].includes(subscription.status)
    && subscription.updatedAt >= new Date(now.getTime() - 16 * DAY)
    && subscription.updatedAt <= new Date(now.getTime() - 13 * DAY)
  );
  if (lapsed) {
    return {
      eventKey: "SUBSCRIPTION_LAPSED_WINBACK",
      values: { ...values, planName: lapsed.planKey, cta: absoluteMainUrl("/cabinet/wallet") },
    };
  }

  const packPurchases = user.transactions.filter((transaction) =>
    ["credits", "points", "pack"].includes(metadataString(transaction.metadata, "purchaseKind") ?? "")
  );
  if (packPurchases.length >= 3 && !user.subscriptions.some((row) => ["ACTIVE", "TRIALING"].includes(row.status))) {
    return {
      eventKey: "SUBSCRIPTION_OFFER_AFTER_PACKS",
      values: {
        ...values,
        packCount: String(packPurchases.length),
        spentRub: String(Math.round(packPurchases.reduce((sum, row) => sum + Math.abs(row.amount), 0) / 100)),
        cta: absoluteMainUrl("/cabinet/wallet"),
      },
    };
  }

  const result = user.productResults[0];
  if (result && result.updatedAt <= new Date(now.getTime() - 5 * DAY)) {
    return {
      eventKey: "RESULT_READY_NO_DEEPENING",
      values: { ...values, service: result.title, cta: absoluteMainUrl("/products") },
    };
  }

  const dialogue = user.dialogues[0];
  if (dialogue?.status === "ANSWERED"
    && dialogue.updatedAt <= new Date(now.getTime() - 7 * DAY)
    && user.referralsGiven.length === 0) {
    return {
      eventKey: "REFERRAL_INVITE_NUDGE",
      values: { ...values, cta: absoluteMainUrl("/cabinet/referrals") },
    };
  }

  const lastActivity = [dialogue?.updatedAt, result?.updatedAt]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  if (lastActivity && lastActivity <= new Date(now.getTime() - 60 * DAY)) {
    return {
      eventKey: "RETURN_AFTER_PAUSE",
      values: { ...values, cta: absoluteMainUrl("/library") },
    };
  }
  return null;
}

export async function runMarketingTriggers(now = new Date()) {
  const users = await db.user.findMany({
    where: {
      role: "CLIENT",
      deletedAt: null,
      blockedAt: null,
      marketingConsentAt: { not: null },
      marketingOptOutAt: null,
    },
    select: { id: true },
    take: 2_000,
  });
  const result = { candidates: users.length, triggered: 0, sent: 0, blocked: 0, failed: 0 };
  for (const user of users) {
    const trigger = await evaluateMarketingTriggerForUser(user.id, now);
    if (!trigger) continue;
    result.triggered += 1;
    const outcome = await sendMarketingMessage({
      userId: user.id,
      eventKey: trigger.eventKey,
      values: trigger.values,
      now,
    });
    result[outcome.status] += 1;
  }
  return result;
}
