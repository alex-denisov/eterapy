export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { VideoRoom } from "@/components/video/video-room";

export default async function SessionPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { bookingId } = await params;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      slot: true,
      practitioner: { include: { user: { select: { id: true, name: true } } } },
      client: { select: { id: true, name: true } },
    },
  });

  if (!booking) redirect("/cabinet");

  const userId = session.user.id;
  const isClient = booking.clientId === userId;
  const isPractitioner = booking.practitioner.userId === userId;
  if (!isClient && !isPractitioner) redirect("/cabinet");

  if (!["CONFIRMED", "IN_PROGRESS"].includes(booking.status)) {
    redirect(isClient ? "/cabinet/bookings" : "/cabinet/practitioner/clients");
  }

  const role = isClient ? "client" : "practitioner";
  const participantName = isClient ? booking.client.name : booking.practitioner.user.name;
  const otherPartyName = isClient ? booking.practitioner.user.name : booking.client.name;

  // Вычисляем длительность из слота бронирования
  const sessionDurationMin = booking.slot
    ? Math.round((new Date(booking.slot.endAt).getTime() - new Date(booking.slot.startAt).getTime()) / 60000)
    : 60;

  return (
    <VideoRoom
      bookingId={bookingId}
      role={role}
      participantName={participantName}
      otherPartyName={otherPartyName}
      priceRub={booking.priceRub}
      sessionDurationMin={sessionDurationMin}
    />
  );
}
