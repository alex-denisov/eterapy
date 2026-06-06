import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { getSpendableClarityCreditBalance, recordClarityCreditEntry } from "@/lib/clarity-credits";
import { V5_BUNDLE_CONTENTS, getProductCreditCost, isKnownBundleProduct, isKnownPaidProduct } from "@/lib/entitlements";
import { requestContextFromHeaders } from "@/lib/request-context";

function parseProductKey(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const body = await req.json().catch(() => null);
  const productKey = parseProductKey((body as { productKey?: unknown } | null)?.productKey);
  if (!productKey || !isKnownPaidProduct(productKey)) {
    return errorWithRequestContext("INVALID_PRODUCT", "Неизвестный платный продукт", 400, context);
  }

  const creditCost = getProductCreditCost(productKey);
  if (!creditCost) {
    return errorWithRequestContext("CREDITS_NOT_SUPPORTED", "Для продукта не настроена оплата кредитами", 400, context);
  }
  const bundleProductKeys = isKnownBundleProduct(productKey) ? V5_BUNDLE_CONTENTS[productKey] : [productKey];

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.productEntitlement.findMany({
        where: {
          userId: session.user.id,
          productKey: { in: bundleProductKeys },
          status: "ACTIVE",
          OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
        },
        select: { id: true, productKey: true },
      });
      const existingKeys = new Set(existing.map((entitlement) => entitlement.productKey));

      if (bundleProductKeys.every((bundleProductKey) => existingKeys.has(bundleProductKey))) {
        return { alreadyUnlocked: true, creditCost, balanceAfter: await getSpendableClarityCreditBalance(session.user.id, tx) };
      }

      const balance = await getSpendableClarityCreditBalance(session.user.id, tx);
      if (balance < creditCost) {
        throw new Error("Недостаточно кредитов");
      }

      const spend = await recordClarityCreditEntry(tx, {
        userId: session.user.id,
        amount: -creditCost,
        type: "spend",
        source: "product",
        sourceEventId: productKey,
        status: "confirmed",
        metadata: {
          productKey,
          checkoutSource: "credits",
          ...(isKnownBundleProduct(productKey) ? { bundleKey: productKey, bundleProductKeys } : {}),
        } as Prisma.InputJsonObject,
      });

      const createdEntitlementIds: string[] = [];
      for (const bundleProductKey of bundleProductKeys) {
        if (existingKeys.has(bundleProductKey)) continue;
        const entitlement = await tx.productEntitlement.create({
          data: {
            userId: session.user.id,
            productKey: bundleProductKey,
            source: productKey === "full-question" ? "bundle" : "credits",
            status: "ACTIVE",
            metadata: {
              creditLedgerEntryId: spend.id,
              creditCost,
              ...(isKnownBundleProduct(productKey) ? { bundleKey: productKey, bundledProductKey: bundleProductKey } : {}),
            } as Prisma.InputJsonObject,
          },
        });
        createdEntitlementIds.push(entitlement.id);
      }

      return { alreadyUnlocked: false, entitlementIds: createdEntitlementIds, creditCost, balanceAfter: spend.balanceAfter };
    });

    return jsonWithRequestContext({ ok: true, productKey, ...result }, undefined, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось списать кредиты";
    return errorWithRequestContext(
      message.includes("Недостаточно") ? "INSUFFICIENT_CREDITS" : "CREDIT_SPEND_FAILED",
      message,
      message.includes("Недостаточно") ? 402 : 500,
      context,
    );
  }
}
