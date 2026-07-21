import { notFound, redirect } from "next/navigation";
import { miniAppService } from "@/lib/miniapp/catalog";

export default async function MiniAppServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = miniAppService(decodeURIComponent(slug));
  if (!service) notFound();
  redirect(service.href);
}
