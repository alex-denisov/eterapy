import { notFound } from "next/navigation";
import { miniAppService } from "@/lib/miniapp/catalog";
import { ServiceDetailScreen } from "@/components/miniapp/journey-screens";

export default async function MiniAppServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = miniAppService(decodeURIComponent(slug));
  if (!service) notFound();
  return <ServiceDetailScreen service={service} />;
}
