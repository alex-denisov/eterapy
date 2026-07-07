import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { canJoinBooking } from "@/lib/booking-actions";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { appUrl } from "@/lib/subdomain";
import { analysisState, type CardBooking } from "./card-types";

// B466 — «Сессии» (owner-дедупликация): ближайшая (30-мин гейт) + прошедшие;
// каждая прошедшая открывает AI-разбор. Статусы разбора (owner #4):
// «разбор готовится» (amber) / «разбор» (green).

export function CardSessions({ bookings }: { bookings: CardBooking[] }) {
  const now = new Date();
  const upcoming = bookings
    .filter((b) => ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot && b.slot.endAt >= now)
    .sort((a, b) => a.slot!.startAt.getTime() - b.slot!.startAt.getTime());
  const past = bookings
    .filter((b) => b.status === "COMPLETED" || (b.slot && b.slot.endAt < now && b.status !== "CANCELLED"))
    .sort((a, b) => (b.slot?.startAt.getTime() ?? b.createdAt.getTime()) - (a.slot?.startAt.getTime() ?? a.createdAt.getTime()));

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="client-card-sessions">
      {/* Ближайшие */}
      <section>
        <p className="soft-eyebrow mb-2.5">Ближайшие</p>
        {upcoming.length === 0 ? (
          <p className="soft-card p-4 text-sm text-[var(--soft-ink-faint)]">Запланированных сессий нет.</p>
        ) : (
          <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
            {upcoming.map((b) => {
              const joinable = canJoinBooking(
                { status: b.status, slot: b.slot ? { startAt: b.slot.startAt.toISOString(), endAt: b.slot.endAt.toISOString() } : null },
                now.getTime(),
              );
              return (
                <div key={b.id} className="flex items-center gap-3 px-3.5 py-3">
                  <Link href={appUrl(`/practitioner/calendar/booking/${b.id}`)} className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">
                      {b.slot ? `${formatMskDayMonth(b.slot.startAt)} в ${formatMskTime(b.slot.startAt)}` : "время уточняется"}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                      {b.status === "PENDING" ? "ждёт вашего подтверждения" : joinable ? "идёт T-30 окно — можно войти" : "«Войти» откроется за 30 мин до начала"}
                    </p>
                  </Link>
                  {joinable ? (
                    <a href={`/session/${b.id}`} className="soft-button soft-button-primary shrink-0" style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}>
                      Войти
                    </a>
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Прошедшие → AI-разбор */}
      <section>
        <p className="soft-eyebrow mb-2.5">Прошедшие</p>
        {past.length === 0 ? (
          <p className="soft-card p-4 text-sm text-[var(--soft-ink-faint)]">Завершённых сессий пока нет.</p>
        ) : (
          <>
            <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
              {past.map((b) => {
                const state = analysisState(b);
                return (
                  <Link
                    key={b.id}
                    href={appUrl(`/practitioner/sessions/${b.id}`)}
                    className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
                    data-testid="client-card-session-row"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium">
                        {b.slot ? formatMskDayMonth(b.slot.startAt) : formatMskDayMonth(b.createdAt)}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">
                        Индивидуальная сессия · {b.priceRub.toLocaleString("ru")} ₽
                      </span>
                    </span>
                    {state === "ready" && (
                      <span className="shrink-0 rounded-full px-2 py-px text-[10px] font-semibold" style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}>
                        разбор
                      </span>
                    )}
                    {state === "pending" && (
                      <span className="shrink-0 rounded-full px-2 py-px text-[10px] font-semibold" style={{ background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }}>
                        разбор готовится
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
                  </Link>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">Нажмите на сессию, чтобы открыть AI-разбор.</p>
          </>
        )}
      </section>
    </div>
  );
}
