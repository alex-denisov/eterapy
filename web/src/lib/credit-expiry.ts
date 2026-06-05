import type { ClarityCreditSource } from "@/lib/clarity-credits";

const DAY_MS = 24 * 60 * 60 * 1000;

const EXPIRING_CREDIT_DAYS: Partial<Record<ClarityCreditSource, number>> = {
  daily_practice: 30,
  welcome: 14,
  mission: 30,
  streak: 30,
  referral: 60,
};

function addDays(now: Date, days: number) {
  return new Date(now.getTime() + days * DAY_MS);
}

export function creditExpiryFor(
  source: Exclude<ClarityCreditSource, "product">,
  now = new Date(),
  periodEnd?: Date | null,
): Date | null {
  if (source === "subscription") return periodEnd ?? null;
  if (source === "purchase" || source === "admin") return null;

  const days = EXPIRING_CREDIT_DAYS[source];
  return typeof days === "number" ? addDays(now, days) : null;
}
