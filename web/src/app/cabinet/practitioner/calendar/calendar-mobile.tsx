import Link from "next/link";
import { Plus, Video } from "lucide-react";
import db from "@/lib/db";
import { canJoinBooking } from "@/lib/booking-actions";
import { formatMskTime, mskDayRange } from "@/lib/msk-time";
import { appUrl } from "@/lib/subdomain";
import { PractitionerAppbar } from "@/components/cabinet/practitioner-appbar";
import type { PractitionerAppbarData } from "@/lib/practitioner-appbar";
import { BookingActions } from "../clients/booking-actions";
import { ChangeRequestActions } from "./change-request-actions";
import type { CalendarTabKey } from "./calendar-tabs";

// B466 R9-4 P3 — мобильный «Календарь» кокпита практика 1-в-1 по mockups
// practitioner-calendar-schedule/-requests/-availability.html: appbar →
// заголовок → сегмент (Расписание · Заявки·N · Доступность) → тело вкладки.
// Данные — те же запросы, что в десктопных табах; экшены заявок переиспользуют
// BookingActions/ChangeRequestActions (перекрашены в .pcab-rq-actions).

const DAY_LONG_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const WEEKDAY_FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const DOW_FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Europe/Moscow" });
const DNUM_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", timeZone: "Europe/Moscow" });
const DAY_MS = 24 * 60 * 60 * 1000;

function initialsOf(label: string): string {
  return (
    label
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** «20 мин назад» / «2 часа назад» / «вчера» — rq-when из макета. */
function agoLabel(from: Date, now: Date): string {
  const min = Math.max(1, Math.round((now.getTime() - from.getTime()) / 60000));
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "час" : h < 5 ? "часа" : "часов"} назад`;
  const d = Math.round(h / 24);
  return d === 1 ? "вчера" : `${d} дн назад`;
}

export function PractitionerCalendarMobileShell({
  appbar,
  tab,
  requestCount,
  children,
}: {
  appbar: PractitionerAppbarData;
  tab: CalendarTabKey;
  requestCount: number;
  children: React.ReactNode;
}) {
  const tabs: Array<{ key: CalendarTabKey; label: string }> = [
    { key: "schedule", label: "Расписание" },
    { key: "requests", label: "Заявки" },
    { key: "availability", label: "Доступность" },
  ];
  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-calendar-mobile">
      <PractitionerAppbar
        initials={appbar.initials}
        name={appbar.name}
        tierLabel={appbar.tierLabel}
        subtitle={appbar.subtitle}
      />
      <div style={{ marginTop: 16 }}>
        <div className="pcab-eyebrow">Календарь практика</div>
        <h1 className="pcab-greeting">Календарь</h1>
      </div>
      <nav className="pcab-seg cols-3" data-testid="calendar-tabs-mobile">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={appUrl(`/practitioner/calendar?tab=${t.key}`)}
            className={`pcab-seg-item${tab === t.key ? " is-active" : ""}`}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
            {t.key === "requests" && requestCount > 0 && <span className="pcab-seg-badge">{requestCount}</span>}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

/* ── Расписание (mockup -calendar-schedule) ──────────────────────────── */
export async function CalendarScheduleMobile({ practitionerId }: { practitionerId: string }) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * DAY_MS);
  const bookings = await db.booking.findMany({
    where: {
      practitionerId,
      status: { in: ["CONFIRMED", "IN_PROGRESS"] },
      slot: { endAt: { gte: now }, startAt: { lt: horizon } },
    },
    include: { client: { select: { id: true, name: true, email: true } }, slot: true },
    orderBy: { slot: { startAt: "asc" } },
  });

  // Неделя (пн–вс) по МСК: активный день — сегодня, точки — дни с сессиями.
  const todayStart = mskDayRange(now).start;
  const dowIndex = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"].indexOf(DOW_FMT.format(now).toLowerCase().replace(".", ""));
  const monday = new Date(todayStart.getTime() - Math.max(0, dowIndex) * DAY_MS);
  const busyDays = new Set(bookings.map((b) => (b.slot ? DNUM_FMT.format(b.slot.startAt) + DOW_FMT.format(b.slot.startAt) : "")));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000);
    return {
      dow: DOW_FMT.format(d).toLowerCase().replace(".", ""),
      dnum: DNUM_FMT.format(d),
      active: i === dowIndex,
      busy: busyDays.has(DNUM_FMT.format(d) + DOW_FMT.format(d)),
    };
  });

  // Группировка по дням с «Сегодня/Завтра».
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const dayKey = (d: Date) => DAY_LONG_FMT.format(d);
  const groups = new Map<string, { label: string; rows: typeof bookings }>();
  for (const b of bookings) {
    if (!b.slot) continue;
    const key = dayKey(b.slot.startAt);
    if (!groups.has(key)) {
      const start = b.slot.startAt;
      const label =
        start >= todayStart && start < tomorrowStart
          ? `Сегодня, ${DAY_LONG_FMT.format(start)}`
          : start >= tomorrowStart && start < new Date(tomorrowStart.getTime() + DAY_MS)
            ? `Завтра, ${DAY_LONG_FMT.format(start)}`
            : WEEKDAY_FMT.format(start);
      groups.set(key, { label, rows: [] });
    }
    groups.get(key)!.rows.push(b);
  }

  const nextId = bookings.find((b) => b.status === "CONFIRMED")?.id;
  let renderedFirstDay = false;

  return (
    <div data-testid="calendar-schedule-mobile">
      <div className="pcab-weekstrip" aria-hidden="true">
        {week.map((d) => (
          <div key={d.dow + d.dnum} className={`pcab-wday${d.active ? " is-active" : ""}`}>
            <div className="dow">{d.dow}</div>
            <div className="dnum">{d.dnum}</div>
            <div className={`ddot${d.busy ? "" : " hide"}`} />
          </div>
        ))}
      </div>

      {groups.size === 0 && (
        <>
          <div className="pcab-dayrow">
            <div>
              <span className="dt">Ближайшие 2 недели</span> · <span className="cnt">сессий нет</span>
            </div>
            <Link href={appUrl("/practitioner/calendar/propose")} className="pcab-add-btn" data-testid="calendar-propose-mobile">
              <Plus width={14} height={14} strokeWidth={2} aria-hidden="true" />
              Записать
            </Link>
          </div>
          <div className="pcab-card r16">
            <p className="pcab-req">
              Клиенты записываются в открытые часы — проверьте «Доступность». Или предложите время своему
              клиенту кнопкой «Записать»: он получит уведомление, подтвердит и оплатит сессию.
            </p>
          </div>
        </>
      )}

      {[...groups.values()].map((group) => {
        const withAdd = !renderedFirstDay;
        renderedFirstDay = true;
        const count = group.rows.length;
        return (
          <div key={group.label}>
            <div className="pcab-dayrow">
              <div>
                <span className="dt">{group.label}</span> ·{" "}
                <span className="cnt">
                  {count} {count === 1 ? "сессия" : count < 5 ? "сессии" : "сессий"}
                </span>
              </div>
              {withAdd && (
                <Link href={appUrl("/practitioner/calendar/propose")} className="pcab-add-btn" data-testid="calendar-propose-mobile">
                  <Plus width={14} height={14} strokeWidth={2} aria-hidden="true" />
                  Записать
                </Link>
              )}
            </div>
            <div className="pcab-list">
              {group.rows.map((b) => {
                const joinable = canJoinBooking(
                  {
                    status: b.status,
                    slot: b.slot ? { startAt: b.slot.startAt.toISOString(), endAt: b.slot.endAt.toISOString() } : null,
                  },
                  now.getTime(),
                );
                const durationMin = b.slot ? Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60000) : 50;
                const live = b.status === "IN_PROGRESS";
                return (
                  <div key={b.id} className="pcab-appt" data-testid="calendar-appt-mobile">
                    <div className="pcab-appt-time">
                      <div className="t1">{b.slot ? formatMskTime(b.slot.startAt) : "—"}</div>
                      <div className="t2">{durationMin} мин</div>
                    </div>
                    <div className={`pcab-appt-bar${live || b.id === nextId ? " soon" : ""}`} />
                    <Link href={appUrl(`/practitioner/calendar/booking/${b.id}`)} className="pcab-appt-main">
                      <div className="pcab-appt-name">{b.client.name ?? b.client.email ?? "Клиент"}</div>
                      <div className="pcab-appt-meta">Индивидуальная · <span className="whitespace-nowrap">{b.priceRub.toLocaleString("ru")} ₽</span></div>
                    </Link>
                    {joinable ? (
                      <a href={`/session/${b.id}`} className="pcab-join-btn">
                        <Video width={12} height={12} strokeWidth={2.2} aria-hidden="true" />
                        Войти
                      </a>
                    ) : live ? (
                      <span className="pcab-appt-status st-soon">идёт</span>
                    ) : (
                      <span className="pcab-appt-status st-conf">подтверждена</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Заявки (mockup -calendar-requests) ──────────────────────────────── */
export async function CalendarRequestsMobile({ practitionerId }: { practitionerId: string }) {
  const now = new Date();
  const [pending, changeRequests] = await Promise.all([
    db.booking.findMany({
      where: { practitionerId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, name: true, email: true } }, slot: true },
    }),
    db.bookingChangeRequest.findMany({
      where: { status: "PENDING", initiatedBy: "CLIENT", booking: { practitionerId } },
      orderBy: { createdAt: "asc" },
      include: { booking: { include: { client: { select: { name: true, email: true } }, slot: true } } },
    }),
  ]);

  // «новый клиент» — не было завершённых сессий с этим практиком.
  const clientIds = [...new Set(pending.map((b) => b.clientId))];
  const completedByClient =
    clientIds.length > 0
      ? await db.booking.groupBy({
          by: ["clientId"],
          where: { practitionerId, clientId: { in: clientIds }, status: "COMPLETED" },
          _count: { _all: true },
        })
      : [];
  const knownClients = new Set(completedByClient.map((r) => r.clientId));

  return (
    <div data-testid="calendar-requests-mobile">
      {/* Новые записи */}
      <div className="pcab-section18">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Новые записи · {pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="pcab-card r16">
            <p className="pcab-req" style={{ color: "var(--pc-ink-faint)" }}>Новых заявок пока нет.</p>
          </div>
        ) : (
          pending.map((b) => {
            const clientLabel = b.client?.name ?? b.client?.email ?? "Клиент";
            const durationMin = b.slot ? Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60000) : 60;
            return (
              <article key={b.id} className="pcab-rq" data-testid="calendar-request-mobile">
                <div className="pcab-rq-top">
                  <div className="pcab-rq-av" aria-hidden="true">{initialsOf(clientLabel)}</div>
                  <div className="pcab-rq-id">
                    <div className="pcab-rq-name">{clientLabel}</div>
                    <div className="pcab-rq-when">заявка {agoLabel(b.createdAt, now)} · оплата зарезервирована</div>
                  </div>
                  {!knownClients.has(b.clientId) && <span className="pcab-rq-tag tag-new">новый клиент</span>}
                </div>
                <div className="pcab-rq-slot">
                  <b>{b.slot ? `${DAY_LONG_FMT.format(b.slot.startAt)}, ${formatMskTime(b.slot.startAt)}` : "время уточняется"}</b>
                  {" · Индивидуальная · "}{durationMin} мин · <b>{b.priceRub.toLocaleString("ru")} ₽</b>
                  {b.meetingContext && (
                    <>
                      <br />
                      Запрос: {b.meetingContext}
                    </>
                  )}
                </div>
                <div className="pcab-rq-actions">
                  <BookingActions
                    bookingId={b.id}
                    status={b.status}
                    sessionStartedAt={b.startedAt?.toISOString() ?? b.slot?.startAt.toISOString()}
                    durationMinutes={durationMin}
                  />
                </div>
                <p className="pcab-rq-hint">
                  Оплата удержана у клиента. При подтверждении сессия появится в расписании; при отклонении —
                  деньги вернутся клиенту.
                </p>
              </article>
            );
          })
        )}
      </div>

      {/* Запросы на изменение */}
      <div className="pcab-section18">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Запросы на изменение · {changeRequests.length}</span>
        </div>
        {changeRequests.length === 0 ? (
          <div className="pcab-card r16">
            <p className="pcab-req" style={{ color: "var(--pc-ink-faint)" }}>
              Запросов на перенос или отмену нет. Клиент может попросить перенос или отмену из своих «Записей» —
              запрос появится здесь.
            </p>
          </div>
        ) : (
          changeRequests.map((r) => {
            const b = r.booking;
            const clientLabel = b.client?.name ?? b.client?.email ?? "Клиент";
            const isCancel = r.type === "CANCEL";
            return (
              <article key={r.id} className="pcab-rq change" data-testid="calendar-change-request-mobile">
                <div className="pcab-rq-top">
                  <div className="pcab-rq-av" aria-hidden="true">{initialsOf(clientLabel)}</div>
                  <div className="pcab-rq-id">
                    <div className="pcab-rq-name">{clientLabel}</div>
                    <div className="pcab-rq-when">
                      {isCancel ? "просит отмену" : "просит перенос"}
                      {r.penaltyApplies ? " · менее чем за 24 ч" : ""}
                    </div>
                  </div>
                  <span className="pcab-rq-tag tag-change">{isCancel ? "отмена" : "перенос"}</span>
                </div>
                <div className="pcab-rq-slot">
                  {isCancel ? (
                    <>
                      <b>{b.slot ? `${DAY_LONG_FMT.format(b.slot.startAt)}, ${formatMskTime(b.slot.startAt)}` : "—"}</b>
                      {" · Индивидуальная"}
                      {r.penaltyApplies && (
                        <>
                          {" · по правилам — "}
                          <b>удержание 100%</b> (поздняя отмена)
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="strike">
                        {b.slot ? `${DAY_LONG_FMT.format(b.slot.startAt)}, ${formatMskTime(b.slot.startAt)}` : "—"}
                      </span>
                      {" → "}
                      <b>
                        {r.proposedStartAt
                          ? `${DAY_LONG_FMT.format(r.proposedStartAt)}, ${formatMskTime(r.proposedStartAt)}`
                          : "новое время уточняется"}
                      </b>
                      {" · Индивидуальная"}
                    </>
                  )}
                  {r.reason && (
                    <>
                      <br />
                      Причина: {r.reason}
                    </>
                  )}
                </div>
                <div className="pcab-rq-actions">
                  <ChangeRequestActions bookingId={b.id} requestId={r.id} penaltyApplies={r.penaltyApplies} />
                </div>
                <p className="pcab-rq-hint">
                  {r.penaltyApplies
                    ? "«Согласовать» удержит с клиента поздний штраф, «Без штрафа» — простит его (клиенту полный возврат)."
                    : "Перенос за сутки и раньше — без штрафа для клиента."}
                </p>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
