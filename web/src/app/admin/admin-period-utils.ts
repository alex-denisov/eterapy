export type AdminCalendarDay = {
  iso: string;
  label: string;
  current: boolean;
};

export function adminPeriodParseIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function adminPeriodToIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function adminPeriodToRuDate(value: string) {
  const date = adminPeriodParseIso(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function adminPeriodFromRuDate(value: string) {
  const normalized = value.trim().replace(/[/-]/g, ".");
  const match = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
  ) return null;
  return adminPeriodToIsoDate(date);
}

export function adminStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function adminPresetRange(period: string) {
  const end = adminStartOfToday();
  let start = new Date(end);
  if (period === "week") {
    const weekday = end.getDay() || 7;
    start.setDate(end.getDate() - weekday + 1);
  } else if (period === "month") {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (period === "quarter") {
    start = new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1);
  }
  return { start: adminPeriodToIsoDate(start), end: adminPeriodToIsoDate(end) };
}

export function adminMonthDays(anchorIso: string): AdminCalendarDay[] {
  const anchor = adminPeriodParseIso(anchorIso) ?? adminStartOfToday();
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const lead = (first.getDay() || 7) - 1;
  const days: AdminCalendarDay[] = [];
  for (let i = lead; i > 0; i -= 1) {
    const date = new Date(first);
    date.setDate(first.getDate() - i);
    days.push({ iso: adminPeriodToIsoDate(date), label: String(date.getDate()), current: false });
  }
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    days.push({ iso: adminPeriodToIsoDate(date), label: String(day), current: true });
  }
  const trailing = 7 - (last.getDay() || 7);
  for (let i = 1; i <= trailing; i += 1) {
    const date = new Date(last);
    date.setDate(last.getDate() + i);
    days.push({ iso: adminPeriodToIsoDate(date), label: String(date.getDate()), current: false });
  }
  return days;
}

export function adminMonthTitle(anchorIso: string) {
  const anchor = adminPeriodParseIso(anchorIso) ?? adminStartOfToday();
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(anchor);
}

export function adminShiftMonth(anchorIso: string, delta: number) {
  const anchor = adminPeriodParseIso(anchorIso) ?? adminStartOfToday();
  return adminPeriodToIsoDate(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
}
