export type AdminCalendarDay = {
  iso: string;
  label: string;
  current: boolean;
  disabled: boolean;
};

export const ADMIN_PLATFORM_FIRST_DEPLOY_ISO = "2026-04-03";
export const ADMIN_ALL_TIME_START_ISO = ADMIN_PLATFORM_FIRST_DEPLOY_ISO;

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

export function adminTodayIso() {
  return adminPeriodToIsoDate(adminStartOfToday());
}

export function adminClampIsoToPlatformRange(value: string) {
  if (!adminPeriodParseIso(value)) return adminTodayIso();
  if (value < ADMIN_PLATFORM_FIRST_DEPLOY_ISO) return ADMIN_PLATFORM_FIRST_DEPLOY_ISO;
  const today = adminTodayIso();
  if (value > today) return today;
  return value;
}

export function adminPlatformWeekInputMin() {
  return adminWeekInputFromIso(ADMIN_PLATFORM_FIRST_DEPLOY_ISO);
}

export function adminPlatformWeekInputMax() {
  return adminWeekInputFromIso(adminTodayIso());
}

export function adminPresetRange(period: string) {
  const end = adminStartOfToday();
  let start = new Date(end);
  if (period === "all") {
    start = adminPeriodParseIso(ADMIN_ALL_TIME_START_ISO) ?? new Date(2026, 3, 3);
  } else if (period === "day" || period === "today") {
    start = adminStartOfToday();
  } else if (period === "week") {
    const weekday = end.getDay() || 7;
    start.setDate(end.getDate() - weekday + 1);
  } else if (period === "month") {
    // Владелец 2026-07-27: «месяц» — это текущий календарный месяц с первого
    // числа, а не последние 30 дней. Кнопки периода отвечают на вопрос «что у
    // нас в этом месяце», а не «сколько набежало за месяц».
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (period === "quarter") {
    start = new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1);
  }
  return { start: adminPeriodToIsoDate(start), end: adminPeriodToIsoDate(end) };
}

export function adminWeekInputFromIso(value: string) {
  const date = adminPeriodParseIso(value) ?? adminStartOfToday();
  const target = new Date(date);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  const week = 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function adminRangeFromWeekInput(value: string) {
  const match = value.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return adminPresetRange("week");
  const [, yearRaw, weekRaw] = match;
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: adminClampIsoToPlatformRange(adminPeriodToIsoDate(monday)),
    end: adminClampIsoToPlatformRange(adminPeriodToIsoDate(sunday)),
  };
}

export function adminQuarterInputFromIso(value: string) {
  const date = adminPeriodParseIso(value) ?? adminStartOfToday();
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

export function adminRangeFromQuarterInput(value: string) {
  const match = value.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return adminPresetRange("quarter");
  const [, yearRaw, quarterRaw] = match;
  const year = Number(yearRaw);
  const quarter = Number(quarterRaw);
  const start = new Date(year, (quarter - 1) * 3, 1);
  const end = new Date(year, quarter * 3, 0);
  return {
    start: adminClampIsoToPlatformRange(adminPeriodToIsoDate(start)),
    end: adminClampIsoToPlatformRange(adminPeriodToIsoDate(end)),
  };
}

export function adminQuarterOptions() {
  const first = adminPeriodParseIso(ADMIN_PLATFORM_FIRST_DEPLOY_ISO) ?? new Date(2026, 3, 3);
  const today = adminStartOfToday();
  const options: Array<{ value: string; label: string }> = [];
  let year = first.getFullYear();
  let quarter = Math.floor(first.getMonth() / 3) + 1;
  const endYear = today.getFullYear();
  const endQuarter = Math.floor(today.getMonth() / 3) + 1;

  while (year < endYear || year === endYear && quarter <= endQuarter) {
    options.push({
      value: `${year}-Q${quarter}`,
      label: `${year} · ${quarter} квартал`,
    });
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }

  return options;
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
    const iso = adminPeriodToIsoDate(date);
    days.push({ iso, label: String(date.getDate()), current: false, disabled: iso < ADMIN_PLATFORM_FIRST_DEPLOY_ISO || iso > adminTodayIso() });
  }
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    const iso = adminPeriodToIsoDate(date);
    days.push({ iso, label: String(day), current: true, disabled: iso < ADMIN_PLATFORM_FIRST_DEPLOY_ISO || iso > adminTodayIso() });
  }
  const trailing = 7 - (last.getDay() || 7);
  for (let i = 1; i <= trailing; i += 1) {
    const date = new Date(last);
    date.setDate(last.getDate() + i);
    const iso = adminPeriodToIsoDate(date);
    days.push({ iso, label: String(date.getDate()), current: false, disabled: iso < ADMIN_PLATFORM_FIRST_DEPLOY_ISO || iso > adminTodayIso() });
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

/**
 * Дата и время одной строкой: `дд.мм.гггг чч:мм` (владелец 2026-07-27).
 *
 * В таблицах пользователей стояла только дата. Для «регистрации» и «последнего
 * входа» это половина сведения: по колонке нельзя было отличить два входа в
 * один день, а по регистрациям — понять всплеск внутри суток. Часовой пояс —
 * московский, как и всё остальное в админке; браузер администратора может
 * стоять в другом, и без явного пояса две панели показывали бы разное.
 */
export function adminDateTime(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date).replace(", ", " ");
}
