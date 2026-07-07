import Link from "next/link";
import { CalendarPlus, ChevronRight, Video } from "lucide-react";
import db from "@/lib/db";
import { canJoinBooking } from "@/lib/booking-actions";
import { formatMskTime } from "@/lib/msk-time";
import { appUrl } from "@/lib/subdomain";

// B466 — «Календарь → Расписание» (mockup -calendar-schedule): ближайшие
// сессии, сгруппированные по дням (14 дней вперёд), «Войти» активна только в
// T-30-окне, «Записать» (B480) — предложить клиенту время.

const DAY_LABEL_FMT = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});

const STATUS_TAG: Record<string, { label: string; style: React.CSSProperties }> = {
  CONFIRMED: { label: "подтверждена", style: { background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" } },
  IN_PROGRESS: { label: "идёт", style: { background: "var(--soft-terracotta)", color: "#FBF1E4" } },
  PENDING: { label: "ждёт ответа", style: { background: "#F6E7DD", color: "var(--soft-bordeaux)" } },
};

export async function ScheduleTab({ practitionerId }: { practitionerId: string }) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const bookings = await db.booking.findMany({
    where: {
      practitionerId,
      status: { in: ["CONFIRMED", "IN_PROGRESS"] },
      slot: { endAt: { gte: now }, startAt: { lt: horizon } },
    },
    include: { client: { select: { id: true, name: true, email: true } }, slot: true },
    orderBy: { slot: { startAt: "asc" } },
  });

  const byDay = new Map<string, typeof bookings>();
  for (const b of bookings) {
    if (!b.slot) continue;
    const key = DAY_LABEL_FMT.format(b.slot.startAt);
    byDay.set(key, [...(byDay.get(key) ?? []), b]);
  }

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-calendar-schedule">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--soft-ink-soft)]">
          {bookings.length === 0
            ? "Подтверждённых сессий в ближайшие 2 недели нет"
            : `Ближайшие 2 недели · ${bookings.length} ${bookings.length === 1 ? "сессия" : bookings.length < 5 ? "сессии" : "сессий"}`}
        </p>
        <Link
          href={appUrl("/practitioner/calendar/propose")}
          className="soft-button soft-button-primary"
          data-testid="practitioner-propose-cta"
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Записать
        </Link>
      </div>

      {byDay.size === 0 ? (
        <div className="soft-card p-5">
          <p className="text-sm text-[var(--soft-ink-soft)]">
            Клиенты записываются в открытые часы — проверьте «Доступность». Или предложите время своему клиенту
            кнопкой «Записать»: он получит уведомление, подтвердит и оплатит сессию.
          </p>
        </div>
      ) : (
        [...byDay.entries()].map(([day, rows]) => (
          <section key={day}>
            <p className="soft-eyebrow mb-2.5 capitalize">{day}</p>
            <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
              {rows.map((b) => {
                const joinable = canJoinBooking(
                  {
                    status: b.status,
                    slot: b.slot
                      ? { startAt: b.slot.startAt.toISOString(), endAt: b.slot.endAt.toISOString() }
                      : null,
                  },
                  now.getTime(),
                );
                const tag = STATUS_TAG[b.status] ?? STATUS_TAG.CONFIRMED;
                const durationMin = b.slot
                  ? Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60000)
                  : 50;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-3.5 py-3">
                    <span className="w-12 shrink-0 font-heading text-[15px]">
                      {b.slot ? formatMskTime(b.slot.startAt) : "—"}
                    </span>
                    <Link href={appUrl(`/practitioner/calendar/booking/${b.id}`)} className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{b.client.name ?? b.client.email ?? "Клиент"}</p>
                      <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                        Индивидуальная сессия · {durationMin} мин · {b.priceRub.toLocaleString("ru")} ₽
                      </p>
                    </Link>
                    {joinable ? (
                      <a href={`/session/${b.id}`} className="soft-button soft-button-primary shrink-0" style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}>
                        <Video className="size-3.5" aria-hidden="true" />
                        Войти
                      </a>
                    ) : (
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px]" style={tag.style}>
                        {tag.label}
                      </span>
                    )}
                    <Link href={appUrl(`/practitioner/calendar/booking/${b.id}`)} aria-label="Открыть сессию" className="shrink-0 text-[var(--soft-ink-faint)]">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
