import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { MiniAppMaterialScreen } from "@/components/miniapp/material-screen";

export const dynamic = "force-dynamic";

export default async function MiniAppMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/miniapp/account?mode=login&intent=material&returnTo=${encodeURIComponent(`/miniapp/materials/${id}`)}`);
  const material = await db.practitionerClientMessage.findUnique({
    where: { id },
    select: { id: true, clientId: true, text: true, attachmentUrl: true, attachmentName: true, sentAt: true, readAt: true, practitioner: { select: { user: { select: { name: true } } } } },
  });
  if (!material || material.clientId !== session.user.id) notFound();
  if (!material.readAt) await db.practitionerClientMessage.update({ where: { id }, data: { readAt: new Date() } }).catch(() => null);
  return <MiniAppMaterialScreen practitioner={material.practitioner.user.name ?? "Ваш специалист"} text={material.text} date={material.sentAt.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} attachment={material.attachmentUrl ? { url: material.attachmentUrl, name: material.attachmentName ?? "Вложение" } : null} />;
}
