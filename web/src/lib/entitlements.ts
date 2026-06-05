import type { Prisma, Transaction } from "@prisma/client";
import db from "@/lib/db";
import { type V5ProductSlug } from "@/lib/v5-products";

export const V5_PRODUCT_PRICES_KOPECKS: Record<string, number> = {
  "perspectives": 29900,
  // Z3: align code ₽ with advertised copy (v5-products.ts / pricing): deep-report
  // was 590 in code but 690 everywhere else; compatibility was 590 but 790.
  "deep-report": 69000,
  "chat-analysis": 39000,
  "compatibility": 79000,
  "circle": 79000,
  "pair": 79000,
  "seven-days": 99000,
  "my-map": 99000,
  "tarot": 39000,
  "natal-chart": 59000,
  "numerology": 39000,
};

export const V5_PRODUCT_CREDIT_COSTS: Record<string, number> = {
  // X18: was 2 here but advertised as «1 кредит» (B322 / v5-products.ts) — a user
  // was charged 2 for a product priced at 1. Aligned to the advertised cost.
  "perspectives": 1,
  "deep-report": 4,
  "chat-analysis": 2,
  "compatibility": 4,
  // Z3: founder-accepted — circle/«Вы двое» = 4 credits (code had 3, copy said 4).
  "circle": 4,
  "pair": 4,
  "seven-days": 8,
  "my-map": 6,
  "tarot": 2,
  "natal-chart": 4,
  "numerology": 2,
};

export const V5_SUBSCRIPTION_PLANS: Record<string, {
  name: string;
  amountKopecks: number;
  trialDays: number;
  includedProducts: V5ProductSlug[];
  creditsPerPeriod: number;
}> = {
  plus: {
    name: "Plus",
    amountKopecks: 49000,
    trialDays: 7,
    // X18: «my-map» (990 ₽) bundled into a 490 ₽ tier meant one included service
    // cost more than the subscription — the founder's exact unit-economics
    // complaint. Plus now bundles only «perspectives» (299 ₽ < 490 ₽) plus the
    // monthly credits; «my-map» stays a Premium / credit purchase.
    includedProducts: ["perspectives"],
    creditsPerPeriod: 12,
  },
  premium: {
    name: "Premium",
    amountKopecks: 129000,
    trialDays: 7,
    // Z2 (credit-centric): Premium no longer "includes everything" (that made the
    // 30 credits pointless). It includes only the two daily anchors; the rest of
    // the premium catalog is paid from the generous monthly credit wallet.
    includedProducts: ["perspectives", "deep-report"],
    creditsPerPeriod: 35,
  },
  // Deprecated legacy aliases are kept readable so older subscriptions do not
  // lose access abruptly, but new checkout should use plus/premium only.
  start: {
    name: "Legacy Start",
    amountKopecks: 149000,
    trialDays: 0,
    includedProducts: ["my-map"],
    creditsPerPeriod: 0,
  },
  deep: {
    name: "Legacy Deep",
    amountKopecks: 699000,
    trialDays: 7,
    includedProducts: ["perspectives", "deep-report", "chat-analysis", "compatibility", "seven-days", "my-map", "tarot", "natal-chart", "numerology"],
    creditsPerPeriod: 0,
  },
  accompaniment: {
    name: "Legacy Accompaniment",
    amountKopecks: 1299000,
    trialDays: 0,
    includedProducts: ["perspectives", "deep-report", "chat-analysis", "compatibility", "seven-days", "my-map", "tarot", "natal-chart", "numerology"],
    creditsPerPeriod: 0,
  },
  practitioner_pro: {
    name: "Practitioner Pro",
    amountKopecks: 149000,
    trialDays: 7,
    includedProducts: [],
    creditsPerPeriod: 0,
  },
  practitioner_pro_plus: {
    name: "Practitioner Pro+",
    amountKopecks: 299000,
    trialDays: 7,
    includedProducts: [],
    creditsPerPeriod: 0,
  },
};

export type BillingPurchaseKind = "balance" | "product" | "subscription";

export type BillingTransactionMetadata = {
  purchaseKind?: BillingPurchaseKind;
  productKey?: string;
  planKey?: string;
  checkoutSource?: string;
  returnPath?: string;
};

export type ResolvedBillingPurchase =
  | {
    kind: "balance";
    amountKopecks: number;
    description: string;
    metadata: BillingTransactionMetadata & { purchaseKind: "balance" };
  }
  | {
    kind: "product";
    amountKopecks: number;
    description: string;
    metadata: BillingTransactionMetadata & { purchaseKind: "product"; productKey: string };
  }
  | {
    kind: "subscription";
    amountKopecks: number;
    description: string;
    metadata: BillingTransactionMetadata & { purchaseKind: "subscription"; planKey: string };
  };

export function getBillingTransactionMetadata(transaction: Pick<Transaction, "metadata">): BillingTransactionMetadata {
  const value = transaction.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as BillingTransactionMetadata
    : {};
}

export function getProductPriceKopecks(productKey: string): number | null {
  return V5_PRODUCT_PRICES_KOPECKS[productKey] ?? null;
}

export function getProductCreditCost(productKey: string): number | null {
  return V5_PRODUCT_CREDIT_COSTS[productKey] ?? null;
}

export function getSubscriptionPlan(planKey: string) {
  return V5_SUBSCRIPTION_PLANS[planKey] ?? null;
}

export function isKnownPaidProduct(productKey: string): productKey is V5ProductSlug {
  return Object.prototype.hasOwnProperty.call(V5_PRODUCT_PRICES_KOPECKS, productKey);
}

export function resolveBillingPurchase(input: {
  amountKopecks?: unknown;
  description?: unknown;
  productKey?: unknown;
  planKey?: unknown;
  checkoutSource?: unknown;
  returnPath?: unknown;
}): ResolvedBillingPurchase {
  const productKey = typeof input.productKey === "string" && input.productKey.trim()
    ? input.productKey.trim()
    : null;
  const planKey = typeof input.planKey === "string" && input.planKey.trim()
    ? input.planKey.trim()
    : null;
  const checkoutSource = typeof input.checkoutSource === "string" && input.checkoutSource.trim()
    ? input.checkoutSource.trim()
    : undefined;
  const returnPath = typeof input.returnPath === "string" && input.returnPath.startsWith("/") && !input.returnPath.startsWith("//")
    ? input.returnPath.slice(0, 500)
    : undefined;

  if (productKey && planKey) {
    throw new Error("Нельзя одновременно оплатить продукт и подписку одним платежом");
  }

  if (productKey) {
    if (!isKnownPaidProduct(productKey)) {
      throw new Error("Неизвестный платный продукт");
    }
    const price = getProductPriceKopecks(productKey);
    if (!price) {
      throw new Error("Цена продукта не настроена");
    }
    return {
      kind: "product",
      amountKopecks: price,
      description: `ETerapy: ${productKey}`,
      metadata: { purchaseKind: "product", productKey, checkoutSource, returnPath },
    };
  }

  if (planKey) {
    const plan = getSubscriptionPlan(planKey);
    if (!plan) {
      throw new Error("Неизвестный тариф");
    }
    return {
      kind: "subscription",
      amountKopecks: plan.amountKopecks,
      description: `ETerapy ${plan.name}: первый период`,
      metadata: { purchaseKind: "subscription", planKey, checkoutSource, returnPath },
    };
  }

  const amountKopecks = Number(input.amountKopecks);
  const description = typeof input.description === "string" && input.description.trim()
    ? input.description.trim()
    : "Пополнение баланса на сайте ETerapy";

  if (!amountKopecks || amountKopecks < 100) {
    throw new Error("Минимальная сумма 100 копеек (1 ₽)");
  }

  return {
    kind: "balance",
    amountKopecks,
    description,
    metadata: { purchaseKind: "balance", checkoutSource, returnPath },
  };
}

export async function userHasActiveEntitlement(userId: string, productKey: string): Promise<boolean> {
  const now = new Date();
  const direct = await db.productEntitlement.findFirst({
    where: {
      userId,
      productKey,
      status: "ACTIVE",
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { id: true },
  });
  if (direct) return true;

  const subscriptions = await db.userSubscription.findMany({
    where: {
      userId,
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    select: { planKey: true },
  });

  // Z2 (credit-centric): a subscription grants access only to its explicit
  // includedProducts anchors; everything else (circle, pair, esoteric, seven-days,
  // my-map, …) is paid from the credit wallet — so credits always have a use.
  return (subscriptions ?? []).some((subscription) => {
    const plan = getSubscriptionPlan(subscription.planKey);
    return Boolean(plan?.includedProducts.includes(productKey as V5ProductSlug));
  });
}

export async function listUserEntitlements(userId: string) {
  const now = new Date();
  const [entitlements, subscriptions] = await Promise.all([
    db.productEntitlement.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    db.userSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    entitlements: entitlements.map((entitlement) => ({
      id: entitlement.id,
      productKey: entitlement.productKey,
      source: entitlement.source,
      status: entitlement.status,
      active: entitlement.status === "ACTIVE" && (!entitlement.validUntil || entitlement.validUntil > now),
      validFrom: entitlement.validFrom,
      validUntil: entitlement.validUntil,
      transactionId: entitlement.transactionId,
    })),
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      planKey: subscription.planKey,
      status: subscription.status,
      active: ["TRIALING", "ACTIVE"].includes(subscription.status) && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now),
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    })),
  };
}

export async function recordCreditLedgerEntry(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    amountKopecks: number;
    balanceAfterKopecks?: number | null;
    type: string;
    source?: string;
    transactionId?: string | null;
    description?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.creditLedgerEntry.create({
    data: {
      userId: input.userId,
      amountKopecks: input.amountKopecks,
      balanceAfterKopecks: input.balanceAfterKopecks ?? null,
      type: input.type,
      source: input.source ?? "yookassa",
      transactionId: input.transactionId ?? null,
      description: input.description ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}

export async function recordSubscriptionClarityCreditGrant(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    amount: number;
    transactionId: string;
    planKey: string;
    expiresAt?: Date | null;
  },
) {
  if (input.amount <= 0) return null;

  const now = new Date();
  const entries = await tx.clarityCreditLedgerEntry.findMany({
    where: { userId: input.userId, status: { in: ["pending", "confirmed"] } },
    select: { amount: true, expiresAt: true },
  });
  const balanceBefore = entries.reduce((sum, entry) => (
    !entry.expiresAt || entry.expiresAt > now ? sum + entry.amount : sum
  ), 0);

  return tx.clarityCreditLedgerEntry.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      balanceAfter: balanceBefore + input.amount,
      type: "grant",
      source: "subscription",
      sourceEventId: input.transactionId,
      status: "confirmed",
      expiresAt: input.expiresAt ?? null,
      metadata: {
        purchaseKind: "subscription",
        planKey: input.planKey,
        transactionId: input.transactionId,
      } as Prisma.InputJsonObject,
    },
  });
}

export async function grantEntitlementForTransaction(
  tx: Prisma.TransactionClient,
  transaction: Pick<Transaction, "id" | "userId" | "amount" | "description" | "metadata">,
) {
  const metadata = getBillingTransactionMetadata(transaction);
  if (metadata.purchaseKind === "product" && metadata.productKey && isKnownPaidProduct(metadata.productKey)) {
    const existing = await tx.productEntitlement.findFirst({
      where: {
        userId: transaction.userId,
        productKey: metadata.productKey,
        transactionId: transaction.id,
      },
      select: { id: true },
    });

    if (!existing) {
      await tx.productEntitlement.create({
        data: {
          userId: transaction.userId,
          productKey: metadata.productKey,
          source: "purchase",
          status: "ACTIVE",
          transactionId: transaction.id,
          metadata: metadata as Prisma.InputJsonObject,
        },
      });
    }

    await recordCreditLedgerEntry(tx, {
      userId: transaction.userId,
      amountKopecks: -Math.abs(transaction.amount),
      type: "PRODUCT_PURCHASE",
      transactionId: transaction.id,
      description: transaction.description,
      metadata: metadata as Prisma.InputJsonObject,
    });
    return { kind: "product" as const, productKey: metadata.productKey };
  }

  if (metadata.purchaseKind === "subscription" && metadata.planKey && getSubscriptionPlan(metadata.planKey)) {
    const plan = getSubscriptionPlan(metadata.planKey)!;
    const now = new Date();
    const trialEndsAt = plan.trialDays > 0
      ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
      : null;
    const currentPeriodEnd = new Date(now);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    await tx.userSubscription.create({
      data: {
        userId: transaction.userId,
        planKey: metadata.planKey,
        status: plan.trialDays > 0 ? "TRIALING" : "ACTIVE",
        provider: "yookassa",
        providerSubscriptionId: transaction.id,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd,
        metadata: metadata as Prisma.InputJsonObject,
      },
    });

    await recordCreditLedgerEntry(tx, {
      userId: transaction.userId,
      amountKopecks: -Math.abs(transaction.amount),
      type: "SUBSCRIPTION_CHARGE",
      transactionId: transaction.id,
      description: transaction.description,
      metadata: metadata as Prisma.InputJsonObject,
    });

    await recordSubscriptionClarityCreditGrant(tx, {
      userId: transaction.userId,
      amount: plan.creditsPerPeriod,
      transactionId: transaction.id,
      planKey: metadata.planKey,
      expiresAt: currentPeriodEnd,
    });
    return { kind: "subscription" as const, planKey: metadata.planKey };
  }

  return { kind: "balance" as const };
}

export async function revokeEntitlementsForTransaction(
  tx: Prisma.TransactionClient,
  transaction: Pick<Transaction, "id" | "userId" | "amount" | "description" | "metadata">,
  reason: string,
) {
  const metadata = getBillingTransactionMetadata(transaction);

  if (metadata.purchaseKind === "product" && metadata.productKey) {
    await tx.productEntitlement.updateMany({
      where: {
        userId: transaction.userId,
        productKey: metadata.productKey,
        transactionId: transaction.id,
        status: "ACTIVE",
      },
      data: {
        status: "REFUNDED",
        revokedAt: new Date(),
        metadata: {
          ...metadata,
          refundReason: reason,
        } as Prisma.InputJsonObject,
      },
    });
  }

  if (metadata.purchaseKind === "subscription" && metadata.planKey) {
    await tx.userSubscription.updateMany({
      where: {
        userId: transaction.userId,
        providerSubscriptionId: transaction.id,
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      },
      data: {
        status: "CANCELLED",
        cancelAtPeriodEnd: false,
        cancelledAt: new Date(),
        metadata: {
          ...metadata,
          refundReason: reason,
        } as Prisma.InputJsonObject,
      },
    });
  }

  if (metadata.purchaseKind === "product" || metadata.purchaseKind === "subscription") {
    await recordCreditLedgerEntry(tx, {
      userId: transaction.userId,
      amountKopecks: Math.abs(transaction.amount),
      type: "REFUND",
      source: "yookassa_refund",
      transactionId: transaction.id,
      description: reason || transaction.description,
      metadata: {
        ...metadata,
        refundReason: reason,
      } as Prisma.InputJsonObject,
    });
  }
}
