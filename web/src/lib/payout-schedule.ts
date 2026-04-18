/**
 * Payout schedule — single source of truth.
 *
 * Decision (backlog item 4.4, 2026-04-18):
 *   - Schedule: twice a month on the 1st and 15th.
 *   - Timezone: Europe/Moscow (fixed UTC+3, no DST).
 *
 * Rationale: the platform and its ops team are based in Moscow; treasury /
 * reconciliation and the admin cabinet all render dates in Europe/Moscow.
 * Using a single business timezone keeps the payout date consistent across
 * practitioner cabinet, admin cabinet, cron jobs, and accounting, and avoids
 * per-practitioner TZ edge cases (one practitioner seeing a payout on the
 * "14th" of their local time while another sees it on the "15th").
 *
 * All helpers in this file return absolute `Date` values whose wall-clock
 * representation in Europe/Moscow lands at 00:00 on the scheduled day.
 */

export const PAYOUT_TZ = "Europe/Moscow";
export const PAYOUT_DAYS = [1, 15] as const;

function getMoscowYMD(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PAYOUT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return {
    y: Number(parts.find((p) => p.type === "year")!.value),
    m: Number(parts.find((p) => p.type === "month")!.value),
    d: Number(parts.find((p) => p.type === "day")!.value),
  };
}

/**
 * Next scheduled payout date after `now`.
 *
 * If today (Europe/Moscow) is day `d`:
 *   - d < 15  → 15th of current month
 *   - d >= 15 → 1st of next month
 *
 * The returned Date is UTC midnight of the payout day — the exact payout
 * cron is expected to run shortly after 00:00 Europe/Moscow (see cron
 * wiring when 4.5 lands). Treating it as a calendar date is sufficient
 * for UI purposes.
 */
export function nextPayoutDate(now: Date = new Date()): Date {
  const { y, m, d } = getMoscowYMD(now);
  if (d < 15) {
    return new Date(Date.UTC(y, m - 1, 15));
  }
  if (m === 12) {
    return new Date(Date.UTC(y + 1, 0, 1));
  }
  return new Date(Date.UTC(y, m, 1));
}

/**
 * Most recent payout date at or before `now` (useful for accounting windows).
 */
export function previousPayoutDate(now: Date = new Date()): Date {
  const { y, m, d } = getMoscowYMD(now);
  if (d >= 15) {
    return new Date(Date.UTC(y, m - 1, 15));
  }
  if (d >= 1 && d < 15) {
    return new Date(Date.UTC(y, m - 1, 1));
  }
  // d == 0 is impossible, but fall back to previous month 15th.
  if (m === 1) {
    return new Date(Date.UTC(y - 1, 11, 15));
  }
  return new Date(Date.UTC(y, m - 2, 15));
}

export function formatPayoutDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PAYOUT_TZ,
  });
}
