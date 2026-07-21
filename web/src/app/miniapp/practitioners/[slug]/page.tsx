import { notFound } from "next/navigation";
import { loadMiniAppPractitioner } from "@/lib/miniapp/journey-data";
import { PractitionerDetailScreen } from "@/components/miniapp/journey-screens";

export default async function MiniAppPractitionerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const practitioner = await loadMiniAppPractitioner(decodeURIComponent(slug));
  if (!practitioner) notFound();
  return <PractitionerDetailScreen practitioner={practitioner} />;
}
