export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { loginUrl } from "@/lib/subdomain";
import { BookingActions } from "../clients/booking-actions";

export default async function PractitionerRequestsPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    include: {
      bookings: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: { client: { select: { name: true, email: true } }, slot: true },
      },
    },
  }).catch(() => null);

  const requests = practitioner?.bookings ?? [];

  return (
    <div className="p-6 md:p-8 max-w-5xl" data-testid="practitioner-requests-page">
      <p className="soft-eyebrow">заявки</p>
      <h1 className="soft-h1 mt-2 mb-2">Новые заявки</h1>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        Быстрая очередь входящих записей: время, сумма, риск-сигналы и действия подтверждения в одном месте.
      </p>
      {requests.length === 0 ? (
        <div className="soft-card p-6">
          <p className="text-[var(--soft-ink-soft)]">Новых заявок пока нет.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((b) => {
            const durationMinutes = b.slot
              ? Math.round((new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000)
              : 60;
            return (
              <article key={b.id} className="soft-card p-5" data-testid="practitioner-request-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--soft-bordeaux)]">{b.client?.name ?? b.client?.email}</p>
                      <span className="soft-badge soft-badge-warm">Ожидает</span>
                      {b.riskScore > 0 && <span className="soft-badge soft-badge-lilac">{b.riskScore}/100 риск</span>}
                    </div>
                    <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                      {b.slot
                        ? new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
                        : "Время уточняется"}
                      {" · "}{durationMinutes} мин · {b.priceRub.toLocaleString("ru-RU")} ₽
                    </p>
                    {b.riskFlags.length > 0 && (
                      <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
                        Сигналы: {b.riskFlags.slice(0, 4).join(", ")}
                      </p>
                    )}
                  </div>
                  <BookingActions
                    bookingId={b.id}
                    status={b.status}
                    sessionStartedAt={b.startedAt?.toISOString() ?? b.slot?.startAt.toISOString()}
                    durationMinutes={durationMinutes}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
