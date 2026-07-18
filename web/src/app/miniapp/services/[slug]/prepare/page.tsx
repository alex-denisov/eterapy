import { notFound } from "next/navigation";
import { miniAppService } from "@/lib/miniapp/catalog";
import { ServicePrepareScreen } from "@/components/miniapp/journey-screens";

export default async function MiniAppServicePreparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = miniAppService(decodeURIComponent(slug));
  if (!service || service.id === "primary" || service.id === "specialist") notFound();
  return <ServicePrepareScreen service={service} />;
}
