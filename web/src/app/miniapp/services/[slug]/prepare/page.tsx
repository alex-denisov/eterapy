import { notFound, redirect } from "next/navigation";
import { miniAppService } from "@/lib/miniapp/catalog";

export default async function MiniAppServicePreparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = miniAppService(decodeURIComponent(slug));
  if (!service || service.id === "primary" || service.id === "specialist") notFound();
  redirect(service.href);
}
