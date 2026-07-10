import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { getProductCreditCost } from "@/lib/entitlements";

export type ClarityCreditStatus = "pending" | "confirmed" | "revoked" | "expired";
export type ClarityCreditType = "grant" | "spend" | "expire" | "clawback" | "adjustment";
export type ClarityCreditSource = "referral" | "mission" | "daily_practice" | "welcome" | "streak" | "purchase" | "subscription" | "admin" | "product";
export type ClarityCreditPointType = "purchased_points" | "subscription_points" | "promo_points" | "compensation_points";

export const CLARITY_CREDIT_POINT_RULES: Record<ClarityCreditPointType, {
  label: string;
  expiryRule: string;
  sources: ClarityCreditSource[];
}> = {
  purchased_points: {
    label: "Купленные баллы",
    expiryRule: "не сгорают",
    sources: ["purchase"],
  },
  subscription_points: {
    label: "Подписочные баллы",
    expiryRule: "сгорают в конце оплаченного периода",
    sources: ["subscription"],
  },
  promo_points: {
    label: "Промо-баллы",
    expiryRule: "сгорают в дату, указанную в интерфейсе",
    sources: ["welcome", "referral", "mission", "daily_practice", "streak"],
  },
  compensation_points: {
    label: "Компенсационные баллы",
    expiryRule: "срок задаёт команда поддержки",
    sources: ["admin"],
  },
};

const ACTIVE_STATUSES: ClarityCreditStatus[] = ["pending", "confirmed"];
const SPENDABLE_STATUSES: ClarityCreditStatus[] = ["confirmed"];

export type ClarityCreditSpendAllocation = {
  source: ClarityCreditSource;
  amount: number;
  expiresAt: string | null;
  pointType: ClarityCreditPointType;
};

export type ClarityCreditLot = {
  source: ClarityCreditSource;
  amount: number;
  expiresAt: Date | null;
};

function isNotExpired(expiresAt: Date | null, now = new Date()) {
  return !expiresAt || expiresAt > now;
}

export function classifyClarityCreditSource(source: ClarityCreditSource | string): ClarityCreditPointType {
  for (const [type, rule] of Object.entries(CLARITY_CREDIT_POINT_RULES) as Array<[ClarityCreditPointType, typeof CLARITY_CREDIT_POINT_RULES[ClarityCreditPointType]]>) {
    if (rule.sources.includes(source as ClarityCreditSource)) return type;
  }
  return "promo_points";
}

function lotKey(source: ClarityCreditSource, expiresAt: Date | string | null) {
  const iso = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;
  return `${source}:${iso ?? "no-expiry"}`;
}

function sortLotsForBurn(a: ClarityCreditLot, b: ClarityCreditLot) {
  if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime();
  if (a.expiresAt) return -1;
  if (b.expiresAt) return 1;

  const priority: Record<ClarityCreditPointType, number> = {
    purchased_points: 0,
    compensation_points: 1,
    promo_points: 2,
    subscription_points: 3,
  };
  return priority[classifyClarityCreditSource(a.source)] - priority[classifyClarityCreditSource(b.source)];
}

export function allocateClarityCreditSpendFromLots(
  lots: ClarityCreditLot[],
  amount: number,
  now = new Date(),
): { ok: true; allocations: ClarityCreditSpendAllocation[] } | { ok: false; allocations: ClarityCreditSpendAllocation[]; missing: number } {
  let remaining = amount;
  const allocations: ClarityCreditSpendAllocation[] = [];
  const ordered = lots
    .filter((lot) => lot.amount > 0 && isNotExpired(lot.expiresAt, now))
    .sort(sortLotsForBurn);

  for (const lot of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(lot.amount, remaining);
    allocations.push({
      source: lot.source,
      amount: take,
      expiresAt: lot.expiresAt?.toISOString() ?? null,
      pointType: classifyClarityCreditSource(lot.source),
    });
    remaining -= take;
  }

  return remaining <= 0
    ? { ok: true, allocations }
    : { ok: false, allocations, missing: remaining };
}

function allocationFromMetadata(value: Prisma.JsonValue | null | undefined): ClarityCreditSpendAllocation[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allocations = (value as { allocations?: unknown }).allocations;
  if (!Array.isArray(allocations)) return null;
  const parsed: ClarityCreditSpendAllocation[] = [];
  for (const item of allocations) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.source !== "string" || typeof record.amount !== "number") return null;
    parsed.push({
      source: record.source as ClarityCreditSource,
      amount: record.amount,
      expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : null,
      pointType: classifyClarityCreditSource(record.source),
    });
  }
  return parsed;
}

function subtractFromLots(lots: Map<string, ClarityCreditLot>, allocation: ClarityCreditSpendAllocation) {
  const key = lotKey(allocation.source, allocation.expiresAt);
  const lot = lots.get(key);
  if (!lot) return;
  lot.amount -= allocation.amount;
}

export function buildOpenClarityCreditLots(
  entries: Array<{
    amount: number;
    source: string;
    type: string;
    status: string;
    expiresAt: Date | null;
    metadata?: Prisma.JsonValue | null;
  }>,
  now = new Date(),
): ClarityCreditLot[] {
  const lots = new Map<string, ClarityCreditLot>();
  const debits: typeof entries = [];

  for (const entry of entries) {
    if (!ACTIVE_STATUSES.includes(entry.status as ClarityCreditStatus)) continue;
    if (entry.expiresAt && entry.expiresAt <= now && entry.amount > 0) continue;
    if (entry.amount > 0 && entry.source !== "product") {
      const source = entry.source as ClarityCreditSource;
      const key = lotKey(source, entry.expiresAt);
      const current = lots.get(key);
      if (current) {
        current.amount += entry.amount;
      } else {
        lots.set(key, { source, amount: entry.amount, expiresAt: entry.expiresAt });
      }
    } else if (entry.amount < 0) {
      debits.push(entry);
    }
  }

  for (const debit of debits) {
    const allocations = allocationFromMetadata(debit.metadata);
    if (allocations) {
      for (const allocation of allocations) subtractFromLots(lots, allocation);
      continue;
    }

    const fallback = allocateClarityCreditSpendFromLots(Array.from(lots.values()), Math.abs(debit.amount), now);
    for (const allocation of fallback.allocations) subtractFromLots(lots, allocation);
  }

  return Array.from(lots.values())
    .filter((lot) => lot.amount > 0 && isNotExpired(lot.expiresAt, now))
    .sort(sortLotsForBurn);
}

export async function planClarityCreditSpend(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  now = new Date(),
) {
  const entries = await tx.clarityCreditLedgerEntry.findMany({
    where: {
      userId,
      status: { in: SPENDABLE_STATUSES },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }, { amount: { lt: 0 } }],
    },
    select: { amount: true, source: true, type: true, status: true, expiresAt: true, metadata: true },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
  });

  return allocateClarityCreditSpendFromLots(buildOpenClarityCreditLots(entries, now), amount, now);
}

export async function getClarityCreditBalance(
  userId: string,
  tx: Prisma.TransactionClient = db,
): Promise<number> {
  const entries = await tx.clarityCreditLedgerEntry.findMany({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    select: { amount: true, source: true, type: true, status: true, expiresAt: true, metadata: true },
  });

  return buildOpenClarityCreditLots(entries, new Date()).reduce((sum, lot) => sum + lot.amount, 0);
}

export async function getClarityCreditBalances(
  userIds: string[],
  tx: Prisma.TransactionClient = db,
  now = new Date(),
): Promise<Map<string, number>> {
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueUserIds.length === 0) return new Map();

  const entries = await tx.clarityCreditLedgerEntry.findMany({
    where: { userId: { in: uniqueUserIds }, status: { in: ACTIVE_STATUSES } },
    select: { userId: true, amount: true, source: true, type: true, status: true, expiresAt: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });
  const entriesByUser = new Map<string, typeof entries>();
  for (const entry of entries) {
    const userEntries = entriesByUser.get(entry.userId) ?? [];
    userEntries.push(entry);
    entriesByUser.set(entry.userId, userEntries);
  }

  return new Map(uniqueUserIds.map((userId) => {
    const balance = buildOpenClarityCreditLots(entriesByUser.get(userId) ?? [], now)
      .reduce((sum, lot) => sum + lot.amount, 0);
    return [userId, balance];
  }));
}

export async function getSpendableClarityCreditBalance(
  userId: string,
  tx: Prisma.TransactionClient = db,
): Promise<number> {
  const entries = await tx.clarityCreditLedgerEntry.findMany({
    where: { userId, status: { in: SPENDABLE_STATUSES } },
    select: { amount: true, source: true, type: true, status: true, expiresAt: true, metadata: true },
  });

  return buildOpenClarityCreditLots(entries, new Date()).reduce((sum, lot) => sum + lot.amount, 0);
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
    const spendPlan = await planClarityCreditSpend(tx, input.userId, cost);
    if (!spendPlan.ok) {
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
        allocations: spendPlan.allocations,
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
