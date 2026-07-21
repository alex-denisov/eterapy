import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { loadMiniAppPractitioner } from "@/lib/miniapp/journey-data";
import { PractitionerBookingScreen } from "@/components/miniapp/booking-screen";

export default async function MiniAppPractitionerBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const practitioner = await loadMiniAppPractitioner(decodeURIComponent(slug));
  if (!practitioner) notFound();

  // B557: «контекст встречи» спрашиваем при ПЕРВОЙ записи к этому специалисту —
  // ровно та же ветка, что на вебе (`/practitioners/[slug]`). Повторная запись
  // к тому же человеку не спрашивает: он уже знает запрос.
  const session = await auth().catch(() => null);
  const askContext = session?.user?.id
    ? !(await db.booking
        .findFirst({ where: { clientId: session.user.id, practitionerId: practitioner.id }, select: { id: true } })
        .catch(() => null))
    : true;

  return <PractitionerBookingScreen practitioner={practitioner} askContext={askContext} />;
}
