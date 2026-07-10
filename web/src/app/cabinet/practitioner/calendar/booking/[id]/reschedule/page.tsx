export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { RescheduleForm } from "./reschedule-form";
import { RescheduleMobile } from "./reschedule-mobile";

// B481 — перенос практиком (mockup -calendar-reschedule): практик предлагает
// новое время → клиент получает уведомление и ПОДТВЕРЖДАЕТ (owner-фикс #2:
// перенос не совершается в одностороннем порядке).

export default async function PractitionerReschedulePage({ params }: { params: Promise<{ id: string }> }) {
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
      {/* R9-4 P3 — мобильный «Перенести» 1-в-1 по макету; десктоп ниже прежний. */}
      <RescheduleMobile bookingId={booking.id} clientLabel={clientLabel} currentLabel={currentLabel} />
    <div className="mx-auto hidden w-full max-w-2xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-reschedule-page">
      <Link href={appUrl(`/practitioner/calendar/booking/${id}`)} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Сессия
      </Link>
      <p className="soft-eyebrow mt-4">Перенос сессии</p>
      <h1 className="soft-h1 mt-2">Предложить перенос</h1>

      <section className="soft-card mt-5 p-4">
        <p className="text-xs text-[var(--soft-ink-faint)]">Сейчас</p>
        <p className="mt-1 text-sm font-medium">
          {booking.client.name ?? booking.client.email ?? "Клиент"} ·{" "}
          {booking.slot
            ? `${formatMskDayMonth(booking.slot.startAt)} в ${formatMskTime(booking.slot.startAt)}`
            : "время уточняется"}
        </p>
      </section>

      <RescheduleForm bookingId={booking.id} />

      <p className="mt-4 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        Клиент получит уведомление и подтвердит новое время — до подтверждения сессия остаётся на текущем слоте.
      </p>
    </div>
    </>
  );
}
