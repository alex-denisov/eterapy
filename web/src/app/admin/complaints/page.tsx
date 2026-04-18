export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ComplaintsManager } from "./complaints-manager";
import { PageContainer } from "@/components/ui/page-container";

export default async function AdminComplaintsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const complaints = await db.complaint.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      booking: {
        include: {
          client: { select: { name: true, email: true } },
          practitioner: { select: { id: true, slug: true, user: { select: { name: true } } } },
          videoSession: {
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true, text: true, fileName: true, fileUrl: true, fileMime: true, createdAt: true,
                  sender: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      reporter: { select: { name: true, email: true } },
    },
  });

  const openCount = complaints.filter(c => c.status === "OPEN").length;

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Жалобы</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Рассмотрение обращений клиентов
          </p>
        </div>
        {openCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-400 font-medium">{openCount} новых</span>
          </div>
        )}
      </div>
      <ComplaintsManager complaints={complaints.map(c => ({
        id: c.id,
        status: c.status,
        reason: c.reason,
        description: c.description,
        resolution: c.resolution,
        createdAt: c.createdAt.toISOString(),
        resolvedAt: c.resolvedAt?.toISOString() ?? null,
        clientName: c.reporter.name,
        clientEmail: c.reporter.email,
        practitionerName: c.booking.practitioner.user.name,
        practitionerId: c.booking.practitioner.id,
        practitionerSlug: c.booking.practitioner.slug,
        bookingId: c.bookingId,
        priceRub: c.booking.priceRub,
        // Artefacts from VideoSession
        transcriptText: c.booking.videoSession?.messages
          .filter(m => m.text)
          .map(m => `[${new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}] ${m.sender.name}: ${m.text}`)
          .join("\n") ?? null,
        recordingUrl: c.booking.videoSession?.recordingUrl ?? null,
        recordingExpiry: c.booking.videoSession?.recordingExpiry?.toISOString() ?? null,
        summaryText: c.booking.videoSession?.summaryText ?? null,
        sessionMessages: c.booking.videoSession?.messages.map(m => ({
          text: m.text,
          fileName: m.fileName,
          fileUrl: m.fileUrl,
          senderName: m.sender.name,
          createdAt: m.createdAt.toISOString(),
        })) ?? [],
      }))} />
    </PageContainer>
  );
}
