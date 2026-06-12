export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { ClientsSessionsTable, type SessionRow } from "./clients-sessions-table";

export default async function PractitionerClientsPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({ where: { userId: session.user!.id } });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const bookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true, email: true } },
      slot: true,
    },
  });

  const rows: SessionRow[] = bookings.map((b) => {
    const durationMinutes = b.slot
      ? Math.round((new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000)
      : 60;
    return {
      id: b.id,
      clientName: b.client.name ?? "Клиент",
      clientEmail: b.client.email ?? "",
      status: b.status,
      startAt: b.slot?.startAt.toISOString() ?? null,
      priceRub: b.priceRub,
      durationMinutes,
      startedAt: b.startedAt?.toISOString() ?? null,
      meetingContext: b.meetingContext ?? null,
    };
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="soft-eyebrow">Кабинет практика</div>
      <h1 className="soft-h1 mt-2 mb-6">Клиенты и записи</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--soft-ink-soft)]">Пока нет записей от клиентов.</p>
      ) : (
        <ClientsSessionsTable rows={rows} />
      )}
    </div>
  );
}
