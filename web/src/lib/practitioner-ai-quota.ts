// B466/B434 — practitioner AI-разбор metering. Owner-frozen numbers
// (2026-07-04): included Pro 20 / Pro+ 50 / Free 0 разборов-сессий per month,
// top-up packs +10/+25/+50 = 790/1790/2990 ₽, auto-topup default OFF.
// Расшифровка (server-STT) + комплаенс are platform-side and NOT metered —
// the quota gates only the AI-разбор outputs (резюме/заметки/сообщение/план).
//
// Pure math lives here (unit-tested, time-injected); the db read model is in
// practitioner-ai-quota-db.ts so client components can import this file.

import type { PractitionerTier } from "./practitioner-tier";

export const AI_ANALYSES_INCLUDED: Record<PractitionerTier, number> = {
  free: 0,
  pro: 20,
  pro_plus: 50,
};

export interface AiTopupPack {
  units: number;
  priceRub: number;
}

export const AI_TOPUP_PACKS: readonly AiTopupPack[] = [
  { units: 10, priceRub: 790 },
  { units: 25, priceRub: 1790 },
  { units: 50, priceRub: 2990 },
] as const;

// МСК is UTC+3 year-round (no DST since 2014) — payouts/quotas follow it.
import { MSK_OFFSET_MS } from "./msk-time";

/** Calendar-month boundaries in МСК expressed as UTC instants. */
export function mskMonthRange(now: Date = new Date()): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + MSK_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - MSK_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - MSK_OFFSET_MS),
  };
}

export interface PractitionerAiQuota {
  tier: PractitionerTier;
  included: number;
  /** Все разборы, потреблённые в текущем месяце (included + topup). */
  usedThisMonth: number;
  /** НЕТТО-остаток докупленного пула (покупки минус все topup-списания). */
  topupBalance: number;
  /** Разборов ещё доступно: остаток включённых + докупленный пул. */
  remaining: number;
  /** true когда ни включённых, ни докупленных разборов не осталось. */
  exhausted: boolean;
  /** 1-е число следующего месяца, 00:00 МСК. */
  periodResetAt: Date;
}

export function computeAiQuota({
  tier,
  usedThisMonth,
  topupBalance,
  now = new Date(),
}: {
  tier: PractitionerTier;
  usedThisMonth: number;
  topupBalance: number;
  now?: Date;
}): PractitionerAiQuota {
  const included = AI_ANALYSES_INCLUDED[tier];
  const includedLeft = Math.max(0, included - usedThisMonth);
  const remaining = includedLeft + Math.max(0, topupBalance);
  return {
    tier,
    included,
    usedThisMonth,
    topupBalance,
    remaining,
    exhausted: remaining <= 0,
    periodResetAt: mskMonthRange(now).end,
  };
}
