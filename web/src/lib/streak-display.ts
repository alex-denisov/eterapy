// B464 round-5 #6 — pure, client-safe streak display helpers.
//
// The stored `practiceStreakCount` is only ever written when the user completes
// a practice day: a broken chain keeps the stale value (e.g. «1») forever.
// UI surfaces must therefore derive the EFFECTIVE streak — alive only while the
// last completed day is today or yesterday (UTC days, matching lib/streaks.ts).
//
// This module must stay free of server imports (db/prisma): it is consumed by
// client components (daily-practice-actions) as well as server pages.

/** Русское склонение по числу: pluralRu(1, ["день","дня","дней"]) === "день". */
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n)) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const digit = abs % 10;
  if (digit === 1) return forms[0];
  if (digit >= 2 && digit <= 4) return forms[1];
  return forms[2];
}

/** 1 день · 2 дня · 5 дней · 21 день · 111 дней. */
export function daysWord(n: number): string {
  return pluralRu(n, ["день", "дня", "дней"]);
}

function dayStartUTC(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Эффективная серия практики: хранимый счётчик жив, только если последняя
 * отметка была сегодня или вчера (UTC-дни). Прерванная серия отображается как
 * 0 — бейдж «Серия: N» прячется, а не показывает stale «1».
 */
export function effectivePracticeStreak(
  count: number,
  lastDoneDate: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!count || count < 1 || !lastDoneDate) return 0;
  const last = lastDoneDate instanceof Date ? lastDoneDate : new Date(lastDoneDate);
  if (Number.isNaN(last.getTime())) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const yesterdayStart = dayStartUTC(now) - dayMs;
  return dayStartUTC(last) >= yesterdayStart ? count : 0;
}
