import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import {
  getProductPriceKopecks,
  getSubscriptionPlan,
  isKnownPaidProduct,
  recordCreditLedgerEntry,
} from "@/lib/entitlements";
import type { V5ProductSlug } from "@/lib/v5-products";

export type ProductBalancePurchaseOutcome =
  | {
    status: "unlocked";
    productKey: V5ProductSlug;
    priceKopecks: number;
    balanceAfterKopecks: number;
    entitlementId: string;
    transactionId: string;
  }
  | {
    status: "already_unlocked";
    productKey: V5ProductSlug;
    priceKopecks: number;
    balanceAfterKopecks: number;
  }
  | {
    status: "insufficient_balance";
    productKey: V5ProductSlug;
    priceKopecks: number;
    balanceKopecks: number;
  };

class InsufficientProductBalanceError extends Error {
  constructor(public balanceKopecks: number, public priceKopecks: number) {
    super("Недостаточно средств на балансе");
  }
}

function activeEntitlementWhere(userId: string, productKey: V5ProductSlug, now: Date) {
  return {
    userId,
    productKey,
    status: "ACTIVE",
    OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  } satisfies Prisma.ProductEntitlementWhereInput;
}

async function hasSubscriptionAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  productKey: V5ProductSlug,
  now: Date,
) {
  const subscriptions = await tx.userSubscription.findMany({
    where: {
      userId,
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    select: { planKey: true },
  });

  return subscriptions.some((subscription) => {
    const plan = getSubscriptionPlan(subscription.planKey);
    return Boolean(
      plan?.includedProducts.includes(productKey)
      || (subscription.planKey === "premium" && ["circle", "pair"].includes(productKey)),
    );
  });
}

export async function purchaseProductWithBalance(input: {
  userId: string;
  productKey: string;
  checkoutSource?: string | null;
}): Promise<ProductBalancePurchaseOutcome> {
  if (!isKnownPaidProduct(input.productKey)) {
    throw new Error("Неизвестный платный продукт");
  }

  const productKey = input.productKey;
  const priceKopecks = getProductPriceKopecks(productKey);
  if (!priceKopecks) {
    throw new Error("Цена продукта не настроена");
  }

  try {
    return await db.$transaction(async (tx) => {
      const now = new Date();
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { balance: true },
      });
      const balanceBefore = user?.balance ?? 0;

      const direct = await tx.productEntitlement.findFirst({
        where: activeEntitlementWhere(input.userId, productKey, now),
        select: { id: true },
      });
      const subscriptionAccess = direct ? false : await hasSubscriptionAccess(tx, input.userId, productKey, now);

      if (direct || subscriptionAccess) {
        return {
          status: "already_unlocked" as const,
          productKey,
          priceKopecks,
          balanceAfterKopecks: balanceBefore,
        };
      }

      const decrement = await tx.user.updateMany({
        where: { id: input.userId, balance: { gte: priceKopecks } },
        data: { balance: { decrement: priceKopecks } },
      });

      if (decrement.count === 0) {
        throw new InsufficientProductBalanceError(balanceBefore, priceKopecks);
      }

      const metadata = {
        purchaseKind: "product",
        productKey,
        checkoutSource: input.checkoutSource ?? "balance",
      } satisfies Prisma.InputJsonObject;

      const transaction = await tx.transaction.create({
        data: {
          userId: input.userId,
          amount: -priceKopecks,
          status: "SUCCEEDED",
          provider: "internal",
          description: `ETerapy: ${productKey}`,
          metadata,
        },
        select: { id: true },
      });

      const updatedUser = await tx.user.findUnique({
        where: { id: input.userId },
        select: { balance: true },
      });
      const balanceAfterKopecks = updatedUser?.balance ?? Math.max(0, balanceBefore - priceKopecks);

      await recordCreditLedgerEntry(tx, {
        userId: input.userId,
        amountKopecks: -priceKopecks,
        balanceAfterKopecks,
        type: "PRODUCT_PURCHASE",
        source: "internal_balance",
        transactionId: transaction.id,
        description: `Покупка продукта ${productKey} с внутреннего баланса`,
        metadata,
      });

      const entitlement = await tx.productEntitlement.create({
        data: {
          userId: input.userId,
          productKey,
          source: "balance",
          status: "ACTIVE",
          transactionId: transaction.id,
          metadata,
        },
        select: { id: true },
      });

      return {
        status: "unlocked" as const,
        productKey,
        priceKopecks,
        balanceAfterKopecks,
        entitlementId: entitlement.id,
        transactionId: transaction.id,
      };
    });
  } catch (error) {
    if (error instanceof InsufficientProductBalanceError) {
      return {
        status: "insufficient_balance",
        productKey,
        priceKopecks,
        balanceKopecks: error.balanceKopecks,
      };
    }
    throw error;
  }
}
