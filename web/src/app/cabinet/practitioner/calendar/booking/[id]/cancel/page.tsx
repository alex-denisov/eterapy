export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { CancelBookingForm } from "./cancel-form";
import { CancelMobile } from "./cancel-mobile";

// B484 — отмена сессии практиком (mockup -calendar-cancel): клиенту ВСЕГДА
// полный возврат; поздние отмены и неявки снижают надёжность и приоритет в
// каталоге (денежного штрафа для практика нет). Нудж — лучше перенести.

export default async function PractitionerCancelPage({ params }: { params: Promise<{ id: string }> }) {
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
    include: { client: { select: { name: true, email: true } }, slot: true },
  });
  if (!booking || booking.practitionerId !== practitioner.id) notFound();
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) redirect(appUrl(`/practitioner/calendar/booking/${id}`));

  const clientLabel = booking.client.name ?? booking.client.email ?? "Клиент";
  const currentLabel = booking.slot
    ? `${formatMskDayMonth(booking.slot.startAt)}, ${formatMskTime(booking.slot.startAt)}`
    : "время уточняется";

  return (
    <>
      {/* R9-4 P3 — мобильная «Отмена сессии» 1-в-1 по макету; десктоп ниже прежний. */}
      <CancelMobile
        bookingId={booking.id}
        clientLabel={clientLabel}
        currentLabel={currentLabel}
        priceLabel={`${booking.priceRub.toLocaleString("ru")} ₽`}
        startAt={booking.slot ? booking.slot.startAt.toISOString() : null}
      />
    <div className="mx-auto hidden w-full max-w-2xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-cancel-page">
      <Link href={appUrl(`/practitioner/calendar/booking/${id}`)} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Сессия
      </Link>
      <p className="soft-eyebrow mt-4">Отмена сессии</p>
      <h1 className="soft-h1 mt-2">Отменить сессию</h1>

      <section className="soft-card mt-5 p-4">
        <p className="text-sm font-medium">
          {booking.client.name ?? booking.client.email ?? "Клиент"} ·{" "}
          {booking.slot
            ? `${formatMskDayMonth(booking.slot.startAt)} в ${formatMskTime(booking.slot.startAt)}`
            : "время уточняется"}
        </p>
      </section>

      <section
        className="mt-4 rounded-[18px] border p-4"
        style={{ borderColor: "var(--soft-amber-bg,#F2E2C2)", background: "rgba(242,226,194,0.35)" }}
        data-testid="practitioner-cancel-warning"
      >
        <div className="flex items-start gap-2.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--soft-amber-ink,#6E5114)" }} />
          <div className="text-sm leading-relaxed" style={{ color: "var(--soft-amber-ink,#6E5114)" }}>
            <p className="font-medium">Клиент получит полный возврат.</p>
            <p className="mt-1">
              Поздние отмены и неявки снижают вашу надёжность и приоритет в каталоге. Если время не подходит —
              лучше предложить перенос.
            </p>
          </div>
        </div>
      </section>

      <CancelBookingForm bookingId={booking.id} />

      <Link
        href={appUrl(`/practitioner/calendar/booking/${booking.id}/reschedule`)}
        className="soft-chip mt-4 inline-flex"
        data-testid="practitioner-cancel-reschedule-nudge"
      >
        Лучше перенести →
      </Link>
    </div>
    </>
  );
}
