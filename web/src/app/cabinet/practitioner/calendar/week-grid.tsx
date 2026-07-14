import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import db from "@/lib/db";
import { formatMskTime } from "@/lib/msk-time";
import { appUrl } from "@/lib/subdomain";
import { WeekDatePicker } from "./week-date-picker";

// B466 R9-5 desktop — «Календарь → Расписание» недельная сетка (mockup
// practitioner-desktop-calendar-v2, owner ROUND 4 #2): 7 колонок дней + гуттер
// часов из активных рабочих часов; блоки сессий, цвет по статусу; навигация
// неделями через ?week=<понедельник MSK> (SSR), «Сегодня» и «Выбрать дату».

const MSK_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MSK_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hourCycle: "h23" });
const FMT_DM = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const FMT_Y = new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone: "Europe/Moscow" });
const FMT_MONTH = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "Europe/Moscow" });

const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const mskDateISO = (d: Date) => MSK_DATE.format(d);
const mskHour = (d: Date) => parseInt(MSK_HOUR.format(d), 10);

function isoAddDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function isoWeekdayMon0(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
/** Полдень UTC для ISO-даты — безопасно форматируется в MSK (тот же день). */
const isoNoon = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Понедельник недели, содержащей дату (MSK). */
export function mskMondayISO(date: Date): string {
  const iso = mskDateISO(date);
  return isoAddDays(iso, -isoWeekdayMon0(iso));
}

/** Валидный ?week= (понедельник) или null. */
export function normalizeWeekParam(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return isoAddDays(raw, -isoWeekdayMon0(raw)); // на всякий случай выравниваем на понедельник
}

const STATUS_STYLE: Record<string, { border: string; bg: string; color: string; tag: string }> = {
  COMPLETED: { border: "var(--soft-sage-ink,#4B6146)", bg: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)", tag: "заверш." },
  IN_PROGRESS: { border: "var(--soft-terracotta)", bg: "#F6E7DD", color: "var(--soft-terracotta-dark)", tag: "идёт" },
  CONFIRMED: { border: "var(--soft-bordeaux)", bg: "color-mix(in srgb, var(--soft-bordeaux) 12%, var(--soft-paper-card))", color: "var(--soft-bordeaux)", tag: "" },
};

export async function WeekGrid({ practitionerId, weekStartISO }: { practitionerId: string; weekStartISO: string }) {
  const now = new Date();
  const todayISO = mskDateISO(now);
  const weekEndISO = isoAddDays(weekStartISO, 7);
  // Границы недели в UTC (MSK-полночь = UTC-3ч).
  const rangeStart = new Date(`${weekStartISO}T00:00:00+03:00`);
  const rangeEnd = new Date(`${weekEndISO}T00:00:00+03:00`);

  const [bookings, rules] = await Promise.all([
    db.booking.findMany({
      where: {
        practitionerId,
        status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] },
        slot: { startAt: { gte: rangeStart, lt: rangeEnd } },
      },
      include: { client: { select: { name: true, email: true } }, slot: true },
      orderBy: { slot: { startAt: "asc" } },
    }),
    db.scheduleRule.findMany({ where: { practitionerId, enabled: true }, select: { startHour: true, endHour: true } }),
  ]);

  // Диапазон часов из активных рабочих часов (дефолт 10–18), расширенный так,
  // чтобы все брони недели были видны.
  let minHour = 10;
  let maxHour = 18;
  if (rules.length) {
    minHour = Math.min(...rules.map((r) => r.startHour));
    maxHour = Math.max(...rules.map((r) => r.endHour));
  }
  for (const b of bookings) {
    if (!b.slot) continue;
    const h = mskHour(b.slot.startAt);
    minHour = Math.min(minHour, h);
    maxHour = Math.max(maxHour, h + 1);
  }
  minHour = Math.max(0, minHour);
  maxHour = Math.min(24, maxHour);
  const hours: number[] = [];
  for (let h = minHour; h <= maxHour; h++) hours.push(h);

  // Дни недели.
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = isoAddDays(weekStartISO, i);
    return { iso, dayNum: Number(iso.slice(8, 10)), label: WEEKDAY_SHORT[i], isToday: iso === todayISO };
  });

  // Брони по (день, час).
  type Appt = (typeof bookings)[number];
  const cellKey = (iso: string, hour: number) => `${iso}#${hour}`;
  const byCell = new Map<string, Appt[]>();
  for (const b of bookings) {
    if (!b.slot) continue;
    const key = cellKey(mskDateISO(b.slot.startAt), mskHour(b.slot.startAt));
    byCell.set(key, [...(byCell.get(key) ?? []), b]);
  }

  // Метки навигации.
  const prevWeek = isoAddDays(weekStartISO, -7);
  const nextWeek = isoAddDays(weekStartISO, 7);
  const todayWeek = mskMondayISO(now);
  const endISO = isoAddDays(weekStartISO, 6);
  const sameMonth = weekStartISO.slice(5, 7) === endISO.slice(5, 7);
  const rangeLabel = sameMonth
    ? `${Number(weekStartISO.slice(8, 10))} – ${FMT_DM.format(isoNoon(endISO))} ${FMT_Y.format(isoNoon(endISO))}`
    : `${FMT_DM.format(isoNoon(weekStartISO))} – ${FMT_DM.format(isoNoon(endISO))} ${FMT_Y.format(isoNoon(endISO))}`;
  const cornerMonth = FMT_MONTH.format(isoNoon(weekStartISO));
  const base = appUrl("/practitioner/calendar");
  const weekHref = (w: string) => `${base}?tab=schedule&week=${w}`;

  return (
    <div className="mt-5" data-testid="practitioner-calendar-schedule">
      {/* Тулбар: навигация неделями + Сегодня + Выбрать дату + Записать */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Link href={weekHref(prevWeek)} aria-label="Предыдущая неделя" className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)]/40">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-[150px] text-center font-heading text-[17px] font-semibold" data-testid="calendar-week-range">{rangeLabel}</span>
        <Link href={weekHref(nextWeek)} aria-label="Следующая неделя" className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)]/40">
          <ChevronRight className="h-4 w-4" />
        </Link>
        <Link href={weekHref(todayWeek)} className="rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3.5 py-2 text-[13px] font-medium text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)]/40">
          Сегодня
        </Link>
        <div className="ml-auto flex items-center gap-2.5">
          <WeekDatePicker basePath={base} current={todayISO} />
          <Link href={appUrl("/practitioner/calendar/propose")} className="soft-button soft-button-primary" data-testid="practitioner-propose-cta">
            <CalendarPlus className="size-4" aria-hidden="true" />
            Записать
          </Link>
        </div>
      </div>

      {/* Недельная сетка */}
      <div
        className="mt-4 grid overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]"
        style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))", boxShadow: "var(--soft-shadow-sm,0 10px 24px rgba(60,40,25,.07))" }}
        data-testid="calendar-week-grid"
      >
        {/* Шапка: угол-месяц + 7 дней */}
        <div className="flex items-end justify-center border-b border-[var(--soft-paper-deep)] pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--soft-terracotta-dark)]">
          {cornerMonth}
        </div>
        {days.map((d) => (
          <div
            key={d.iso}
            className="border-b border-l border-[var(--soft-paper-deep)] px-1.5 py-2.5 text-center text-xs"
            style={d.isToday
              ? { color: "var(--soft-bordeaux)", fontWeight: 700, background: "color-mix(in srgb, var(--soft-terracotta) 8%, transparent)" }
              : { color: "var(--soft-ink-faint)" }}
          >
            {d.label}
            <b className="mt-0.5 block font-heading text-[16px]" style={{ color: d.isToday ? "var(--soft-bordeaux)" : "var(--soft-ink)" }}>{d.dayNum}</b>
          </div>
        ))}

        {/* Часовые ряды */}
        {hours.map((h) => (
          <div key={`row-${h}`} className="contents">
            <div className="border-t border-[var(--soft-paper-deep)] pr-1.5 pt-1.5 text-right text-[10.5px] text-[var(--soft-ink-faint)]">
              {String(h).padStart(2, "0")}:00
            </div>
            {days.map((d) => {
              const appts = byCell.get(cellKey(d.iso, h)) ?? [];
              return (
                <div
                  key={`${d.iso}-${h}`}
                  className="relative min-h-[52px] border-l border-t border-[var(--soft-paper-deep)] p-1"
                  style={d.isToday ? { background: "color-mix(in srgb, var(--soft-terracotta) 4%, transparent)" } : undefined}
                >
                  <div className="flex flex-col gap-1">
                    {appts.map((b) => {
                      const st = STATUS_STYLE[b.status] ?? STATUS_STYLE.CONFIRMED;
                      const durationMin = b.slot ? Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60000) : 50;
                      const sub = st.tag
                        ? `${st.tag} · ${durationMin}м`
                        : `${b.slot ? formatMskTime(b.slot.startAt) : ""} · ${durationMin}м`;
                      return (
                        <Link
                          key={b.id}
                          href={appUrl(`/practitioner/calendar/booking/${b.id}`)}
                          className="block overflow-hidden rounded-lg px-1.5 py-1 text-[10.5px] font-semibold leading-tight"
                          style={{ background: st.bg, color: st.color, borderLeft: `3px solid ${st.border}` }}
                          data-testid="calendar-week-appt"
                        >
                          <span className="block truncate">{b.client.name ?? b.client.email ?? "Клиент"}</span>
                          <span className="block truncate font-normal opacity-80">{sub}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {bookings.length === 0 && (
        <p className="mt-3 text-sm text-[var(--soft-ink-faint)]">
          На этой неделе подтверждённых сессий нет. Откройте часы в «Доступности» или предложите время клиенту
          кнопкой «Записать».
        </p>
      )}
    </div>
  );
}
