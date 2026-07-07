import db from "@/lib/db";
import { formatMskTime } from "@/lib/msk-time";
import { BookingActions } from "../clients/booking-actions";
import { ChangeRequestActions } from "./change-request-actions";

// B466 — «Календарь → Заявки» (mockup -calendar-requests): новые записи
// (PENDING, подтвердить/отклонить + escrow-hint) и запросы клиентов на
// перенос/отмену (B481: перенос «Согласовать», отмена <24ч «Без штрафа»/«со
// штрафом»).

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});

export async function RequestsTab({ practitionerId }: { practitionerId: string }) {
  const [pending, changeRequests] = await Promise.all([
    db.booking.findMany({
      where: { practitionerId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true, email: true } }, slot: true },
    }),
    db.bookingChangeRequest.findMany({
      where: { status: "PENDING", initiatedBy: "CLIENT", booking: { practitionerId } },
      orderBy: { createdAt: "asc" },
      include: {
        booking: {
          include: { client: { select: { name: true, email: true } }, slot: true },
        },
      },
    }),
  ]);

  return (
    <div className="mt-5 flex flex-col gap-5" data-testid="practitioner-requests-page">
      {/* Новые записи */}
      <section>
        <p className="soft-eyebrow mb-2.5">Новые записи · {pending.length}</p>
        {pending.length === 0 ? (
          <div className="soft-card p-5">
            <p className="text-sm text-[var(--soft-ink-soft)]">Новых заявок пока нет.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((b) => {
              const durationMinutes = b.slot
                ? Math.round((new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000)
                : 60;
              return (
                <article key={b.id} className="soft-card p-4 sm:p-5" data-testid="practitioner-request-card">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--soft-bordeaux)]">{b.client?.name ?? b.client?.email}</p>
                        <span className="soft-badge soft-badge-warm">Ожидает</span>
                        {b.riskScore > 0 && <span className="soft-badge soft-badge-lilac">{b.riskScore}/100 риск</span>}
                      </div>
                      <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                        {b.slot
                          ? `${DAY_FMT.format(b.slot.startAt)} в ${formatMskTime(b.slot.startAt)}`
                          : "Время уточняется"}
                        {" · "}{durationMinutes} мин · {b.priceRub.toLocaleString("ru-RU")} ₽
                      </p>
                      {b.riskFlags.length > 0 && (
                        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
                          Сигналы: {b.riskFlags.slice(0, 4).join(", ")}
                        </p>
                      )}
                      {b.meetingContext && (
                        <div
                          className="mt-3 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-3"
                          data-testid="request-meeting-context"
                        >
                          <p className="soft-eyebrow mb-1">контекст встречи</p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                            {b.meetingContext}
                          </p>
                        </div>
                      )}
                    </div>
                    <BookingActions
                      bookingId={b.id}
                      status={b.status}
                      sessionStartedAt={b.startedAt?.toISOString() ?? b.slot?.startAt.toISOString()}
                      durationMinutes={durationMinutes}
                    />
                  </div>
                  <p className="mt-3 border-t border-[var(--soft-paper-deep)] pt-2.5 text-xs text-[var(--soft-ink-faint)]">
                    Оплата клиента уже на удержании — спишется после сессии.
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Запросы на изменение (B481) */}
      <section data-testid="practitioner-change-requests">
        <p className="soft-eyebrow mb-2.5">Запросы на изменение · {changeRequests.length}</p>
        {changeRequests.length === 0 ? (
          <div className="soft-card p-5">
            <p className="text-sm text-[var(--soft-ink-soft)]">
              Запросов на перенос или отмену нет. Клиент может попросить перенести или отменить сессию из своих
              «Записей» — запрос появится здесь.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {changeRequests.map((r) => {
              const b = r.booking;
              return (
                <article key={r.id} className="soft-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[var(--soft-bordeaux)]">{b.client?.name ?? b.client?.email}</p>
                    <span className="soft-badge soft-badge-warm">
                      {r.type === "CANCEL" ? "просит отменить" : "просит перенести"}
                    </span>
                    {r.penaltyApplies && (
                      <span className="soft-badge soft-badge-lilac" title="Отмена менее чем за 24 часа">
                        менее 24ч · штраф
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                    Сессия {b.slot ? `${DAY_FMT.format(b.slot.startAt)} в ${formatMskTime(b.slot.startAt)}` : "—"}
                    {r.type === "RESCHEDULE" && r.proposedStartAt
                      ? ` → ${DAY_FMT.format(r.proposedStartAt)} в ${formatMskTime(r.proposedStartAt)}`
                      : ""}
                  </p>
                  {r.reason && (
                    <p className="mt-1.5 text-xs text-[var(--soft-ink-faint)]">Причина: {r.reason}</p>
                  )}
                  <div className="mt-3">
                    <ChangeRequestActions bookingId={b.id} requestId={r.id} penaltyApplies={r.penaltyApplies} />
                  </div>
                  {r.penaltyApplies && (
                    <p className="mt-2.5 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                      «Согласовать» удержит с клиента поздний штраф, «Без штрафа» — простит его (клиенту полный
                      возврат).
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
