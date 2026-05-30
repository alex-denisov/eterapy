export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PageContainer } from "@/components/ui/page-container";
import { SessionsTable, type VideoSessionRow } from "./sessions-table";

export default async function AdminSessionsPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const videoSessions = await db.videoSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      booking: {
        include: {
          client: { select: { name: true, email: true } },
          practitioner: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  const rows: VideoSessionRow[] = videoSessions.map((s) => ({
    id: s.id,
    clientName: s.booking.client.name ?? "Клиент",
    clientEmail: s.booking.client.email ?? "",
    practitionerName: s.booking.practitioner.user.name ?? "Практик",
    status: s.status,
    roomName: s.roomName,
    durationMin:
      s.startedAt && s.endedAt
        ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)
        : null,
    createdAt: s.createdAt.toISOString(),
    recordingUrl: s.recordingUrl ?? null,
    recordingExpiry: s.recordingExpiry?.toISOString() ?? null,
  }));

  const active = rows.filter((s) => s.status === "ACTIVE").length;

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Видеосессии</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active > 0 ? <span className="text-green-400">{active} активных</span> : "Нет активных"} · всего {rows.length}
          </p>
        </div>
      </div>

      <SessionsTable rows={rows} />
    </PageContainer>
  );
}
