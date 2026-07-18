import { notFound } from "next/navigation";
import { loadMiniAppPractitioner } from "@/lib/miniapp/journey-data";
import { PractitionerBookingScreen } from "@/components/miniapp/journey-screens";

export default async function MiniAppPractitionerBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const practitioner = await loadMiniAppPractitioner(decodeURIComponent(slug));
  if (!practitioner) notFound();
  return <PractitionerBookingScreen practitioner={practitioner} />;
}
