import { notFound } from "next/navigation";
import { miniAppLibrary } from "@/lib/miniapp/journey-data";
import { LibraryDetailScreen } from "@/components/miniapp/journey-screens";

export default async function MiniAppLibraryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = miniAppLibrary().find((item) => item.slug === decodeURIComponent(slug));
  if (!entry) notFound();
  return <LibraryDetailScreen entry={entry} />;
}
