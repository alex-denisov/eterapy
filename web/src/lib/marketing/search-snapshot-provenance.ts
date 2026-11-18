import type { Prisma } from "@prisma/client";

const KEY = "webmaster_daily_verified";

export function hasVerifiedSearchFlow(sources: unknown): boolean {
  return Array.isArray(sources) && sources.some((item: unknown) =>
    typeof item === "object" && item !== null && "key" in item && item.key === KEY);
}

export function withVerifiedSearchFlow(sources: unknown): Prisma.InputJsonValue {
  const existing = Array.isArray(sources) ? sources.filter((item: unknown) =>
    !(typeof item === "object" && item !== null && "key" in item && item.key === KEY)) : [];
  return [...existing, { key: KEY }] as Prisma.InputJsonValue;
}

export function verifiedImpressionsTotal(
  rows: readonly { impressions: number; sources: unknown }[], start: Date, now: Date,
): number | null {
  const expectedDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
  if (rows.length !== expectedDays || rows.some((row) => !hasVerifiedSearchFlow(row.sources))) return null;
  return rows.reduce((sum, row) => sum + row.impressions, 0);
}
