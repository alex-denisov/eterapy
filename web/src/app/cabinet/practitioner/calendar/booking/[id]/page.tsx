export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, MessageSquare, UserRound, Video, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { canJoinBooking } from "@/lib/booking-actions";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { appUrl, loginUrl } from "@/lib/subdomain";

// B466 — карточка брони (mockup -calendar-session): клиент · время · формат ·
// цена · статус; «Войти» строго в T-30-окне (JOIN_WINDOW); действия Перенести
// (B481, через подтверждение клиента) / Отменить (B484) / Сообщение / Карточка
// клиента; заметка про AI-разбор после сессии.

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидает подтверждения",
  CONFIRMED: "Подтверждена",
  IN_PROGRESS: "Идёт сейчас",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
  DISPUTED: "Спор",
  REFUNDED: "Возврат",
  EXPIRED: "Не состоялась",
};

export default async function PractitionerBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const { id } = await params;
  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true } },
      slot: true,
      videoSession: { select: { id: true, summaryText: true } },
      changeRequests: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!booking || booking.practitionerId !== practitioner.id) notFound();

  const now = new Date();
  const joinable = canJoinBooking(
    {
      status: booking.status,
      slot: booking.slot
        ? { startAt: booking.slot.startAt.toISOString(), endAt: booking.slot.endAt.toISOString() }
        : null,
    },
    now.getTime(),
  );
  const durationMin = booking.slot
    ? Math.round((booking.slot.endAt.getTime() - booking.slot.startAt.getTime()) / 60000)
    : 50;
  const clientLabel = booking.client.name ?? booking.client.email ?? "Клиент";
  const upcoming = ["PENDING", "CONFIRMED"].includes(booking.status);
  const openRequest = booking.changeRequests[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-booking-page">
      <Link href={appUrl("/practitioner/calendar")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Календарь
      </Link>
      <p className="soft-eyebrow mt-4">Сессия</p>
      <h1 className="soft-h1 mt-2">{clientLabel}</h1>

      {/* Session card */}
      <section className="soft-card mt-5 p-4 sm:p-5" data-testid="practitioner-booking-card">
        <dl className="divide-y divide-[var(--soft-paper-deep)]">
          {[
            ["Когда", booking.slot ? `${formatMskDayMonth(booking.slot.startAt)} · ${formatMskTime(booking.slot.startAt)} – ${formatMskTime(booking.slot.endAt)}` : "Время уточняется"],
            ["Формат", `Индивидуальная сессия · ${durationMin} мин`],
            ["Стоимость", `${booking.priceRub.toLocaleString("ru")} ₽`],
            ["Статус", STATUS_LABELS[booking.status] ?? booking.status],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <dt className="text-[var(--soft-ink-faint)]">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {booking.meetingContext && (
          <div className="mt-3 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-3">
            <p className="soft-eyebrow mb-1">контекст встречи</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--soft-ink-soft)]">{booking.meetingContext}</p>
          </div>
        )}

        {/* Join gate — T-30 */}
        {upcoming || booking.status === "IN_PROGRESS" ? (
          joinable ? (
            <a href={`/session/${booking.id}`} className="soft-button soft-button-primary mt-4 w-full justify-center" data-testid="practitioner-booking-join">
              <Video className="size-4" aria-hidden="true" />
              Войти в сессию
            </a>
          ) : (
            <div
              className="mt-4 rounded-[13px] px-4 py-3 text-center text-sm"
              style={{ background: "var(--soft-paper-deep)", color: "var(--soft-ink-faint)" }}
              data-testid="practitioner-booking-join-gated"
            >
              «Войти» откроется за 30 мин до начала
              {booking.slot ? ` — в ${formatMskTime(new Date(booking.slot.startAt.getTime() - 30 * 60000))}` : ""}
            </div>
          )
        ) : null}
      </section>

      {/* Open change request */}
      {openRequest && (
        <section className="soft-card mt-4 p-4" data-testid="practitioner-booking-open-request">
          <p className="text-sm font-medium">
            {openRequest.initiatedBy === "CLIENT" ? "Клиент" : "Вы"}{" "}
            {openRequest.type === "CANCEL" ? "просит отменить сессию" : "предлагает перенос"}
            {openRequest.proposedStartAt
              ? ` на ${formatMskDayMonth(openRequest.proposedStartAt)} в ${formatMskTime(openRequest.proposedStartAt)}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">
            {openRequest.initiatedBy === "CLIENT"
              ? "Ответьте в «Календарь → Заявки»."
              : "Ждём подтверждения клиента — он получил уведомление."}
          </p>
        </section>
      )}

      {/* Actions */}
      {upcoming && !openRequest && (
        <section className="mt-4 grid grid-cols-2 gap-2.5" data-testid="practitioner-booking-actions">
          <Link href={appUrl(`/practitioner/calendar/booking/${booking.id}/reschedule`)} className="soft-button soft-button-ghost justify-center">
            <CalendarClock className="size-4" aria-hidden="true" />
            Перенести
          </Link>
          <Link href={appUrl(`/practitioner/calendar/booking/${booking.id}/cancel`)} className="soft-button soft-button-ghost justify-center">
            <XCircle className="size-4" aria-hidden="true" />
            Отменить
          </Link>
          <Link href={appUrl(`/practitioner/clients/${booking.client.id}?tab=messages`)} className="soft-button soft-button-ghost justify-center">
            <MessageSquare className="size-4" aria-hidden="true" />
            Сообщение
          </Link>
          <Link href={appUrl(`/practitioner/clients/${booking.client.id}`)} className="soft-button soft-button-ghost justify-center">
            <UserRound className="size-4" aria-hidden="true" />
            Карточка клиента
          </Link>
        </section>
      )}

      {/* AI-разбор note / link */}
      {booking.status === "COMPLETED" && booking.videoSession?.summaryText ? (
        <Link
          href={appUrl(`/practitioner/sessions/${booking.id}`)}
          className="soft-card mt-4 block p-4 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)]"
          data-testid="practitioner-booking-analysis"
        >
          <p className="text-sm font-medium text-[var(--soft-bordeaux)]">AI-разбор сессии готов →</p>
          <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">Резюме, заметки, транскрипт и сообщение клиенту</p>
        </Link>
      ) : upcoming ? (
        <p className="mt-4 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          После сессии здесь появится AI-разбор: резюме, заметки и черновик сообщения клиенту (в рамках месячной
          квоты разборов).
        </p>
      ) : null}
    </div>
  );
}
