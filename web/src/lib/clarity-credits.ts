import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { getProductCreditCost } from "@/lib/entitlements";

export type ClarityCreditStatus = "pending" | "confirmed" | "revoked" | "expired";
export type ClarityCreditType = "grant" | "spend" | "expire" | "clawback" | "adjustment";
export type ClarityCreditSource = "referral" | "mission" | "daily_practice" | "welcome" | "streak" | "purchase" | "subscription" | "admin" | "product";

const ACTIVE_STATUSES: ClarityCreditStatus[] = ["pending", "confirmed"];
const SPENDABLE_STATUSES: ClarityCreditStatus[] = ["confirmed"];

function isNotExpired(expiresAt: Date | null, now = new Date()) {
  return !expiresAt || expiresAt > now;
}

export async function getClarityCreditBalance(
  userId: string,
  tx: Prisma.TransactionClient = db,
): Promise<number> {
  const entries = await tx.clarityCreditLedgerEntry.findMany({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    select: { amount: true, expiresAt: true },
  });

  return entries.reduce((sum, entry) => (
    isNotExpired(entry.expiresAt) ? sum + entry.amount : sum
  ), 0);
}

export async function getSpendableClarityCreditBalance(
  userId: string,
  tx: Prisma.TransactionClient = db,
): Promise<number> {
  const entries = await tx.clarityCreditLedgerEntry.findMany({
    where: { userId, status: { in: SPENDABLE_STATUSES } },
    select: { amount: true, expiresAt: true },
  });

  return entries.reduce((sum, entry) => (
    isNotExpired(entry.expiresAt) ? sum + entry.amount : sum
  ), 0);
}

export async function recordClarityCreditEntry(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    amount: number;
    type: ClarityCreditType;
    source: ClarityCreditSource;
    sourceEventId?: string | null;
    status?: ClarityCreditStatus;
    expiresAt?: Date | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const balanceBefore = await getClarityCreditBalance(input.userId, tx);
  const activeAmount = ACTIVE_STATUSES.includes(input.status ?? "confirmed") && isNotExpired(input.expiresAt ?? null)
    ? input.amount
    : 0;
  const balanceAfter = balanceBefore + activeAmount;

  return tx.clarityCreditLedgerEntry.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      balanceAfter,
      type: input.type,
      source: input.source,
      sourceEventId: input.sourceEventId ?? null,
      status: input.status ?? "confirmed",
      expiresAt: input.expiresAt ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}

export async function grantClarityCredits(input: {
  userId: string;
  amount: number;
  source: Exclude<ClarityCreditSource, "product">;
  sourceEventId?: string | null;
  status?: Extract<ClarityCreditStatus, "pending" | "confirmed">;
  expiresAt?: Date | null;
  metadata?: Prisma.InputJsonValue;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Количество баллов должно быть положительным целым числом");
  }

  return db.$transaction((tx) => recordClarityCreditEntry(tx, {
    userId: input.userId,
    amount: input.amount,
    type: "grant",
    source: input.source,
    sourceEventId: input.sourceEventId,
    status: input.status ?? "confirmed",
    expiresAt: input.expiresAt ?? null,
    metadata: input.metadata,
  }));
}
export async function spendClarityCreditsForProduct(input: {
  userId: string;
  productKey: string;
  sourceEventId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const cost = getProductCreditCost(input.productKey);
  if (!cost) {
    throw new Error("Для продукта не настроена стоимость в баллах");
  }

  return db.$transaction(async (tx) => {
    const balance = await getSpendableClarityCreditBalance(input.userId, tx);
    if (balance < cost) {
      throw new Error("Недостаточно баллов");
    }

    return recordClarityCreditEntry(tx, {
      userId: input.userId,
      amount: -cost,
      type: "spend",
      source: "product",
      sourceEventId: input.sourceEventId ?? input.productKey,
      status: "confirmed",
      metadata: {
        productKey: input.productKey,
        ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {}),
      } as Prisma.InputJsonObject,
    });
  });
}

export async function revokeClarityCredits(input: {
  userId: string;
  amount: number;
  source: ClarityCreditSource;
  sourceEventId?: string | null;
  reason: string;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Количество отзываемых баллов должно быть положительным целым числом");
  }

  return db.$transaction((tx) => recordClarityCreditEntry(tx, {
    userId: input.userId,
    amount: -input.amount,
    type: "clawback",
    source: input.source,
    sourceEventId: input.sourceEventId,
    status: "confirmed",
    metadata: { reason: input.reason } as Prisma.InputJsonObject,
  }));
}
