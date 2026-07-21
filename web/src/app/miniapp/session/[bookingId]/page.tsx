import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { MiniAppSessionScreen } from "@/components/miniapp/session-screen";

export const dynamic = "force-dynamic";

export default async function MiniAppSessionPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/miniapp/account?mode=login&intent=session&returnTo=${encodeURIComponent(`/miniapp/session/${bookingId}`)}`);
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { slot: true, practitioner: { include: { user: { select: { id: true, name: true } } } }, client: { select: { id: true, name: true } } },
  });
  if (!booking || (booking.clientId !== session.user.id && booking.practitioner.userId !== session.user.id)) notFound();
  if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) redirect("/miniapp/profile/bookings");
  const isClient = booking.clientId === session.user.id;
  const duration = booking.slot ? Math.round((booking.slot.endAt.getTime() - booking.slot.startAt.getTime()) / 60_000) : 60;
  return <MiniAppSessionScreen bookingId={bookingId} role={isClient ? "client" : "practitioner"} participantName={isClient ? booking.client.name : booking.practitioner.user.name} otherPartyName={isClient ? booking.practitioner.user.name : booking.client.name} priceRub={booking.priceRub} sessionDurationMin={duration} />;
}
