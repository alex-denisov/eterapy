// B466 — МСК (Europe/Moscow, UTC+3, без DST с 2014) time helpers shared by the
// practitioner cabinet: выплаты, квоты и «Сегодня» считаются по МСК.

export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Calendar-day boundaries in МСК expressed as UTC instants. */
export function mskDayRange(now: Date = new Date()): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + MSK_OFFSET_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - MSK_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + 24 * 60 * 60 * 1000) };
}

/** Hour of day (0–23) in МСК. */
export function mskHour(now: Date = new Date()): number {
  return new Date(now.getTime() + MSK_OFFSET_MS).getUTCHours();
}

const TIME_FMT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMskTime(date: Date): string {
  return TIME_FMT.format(date);
}

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "long",
  weekday: "long",
});

/** «6 июля, воскресенье» */
export function formatMskDayLong(date: Date): string {
  const parts = DAY_FMT.formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return `${day} ${month}, ${weekday}`;
}

const MONTH_FMT = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", month: "long" });

/** «июль» */
export function formatMskMonthName(date: Date): string {
  return MONTH_FMT.format(date);
}

const DAY_MONTH_FMT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "long",
});

/** «1 августа» */
export function formatMskDayMonth(date: Date): string {
  return DAY_MONTH_FMT.format(date);
}
