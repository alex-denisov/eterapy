import { DiaryDetailScreen } from "@/components/miniapp/journey-screens";

export default async function MiniAppDiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiaryDetailScreen itemId={decodeURIComponent(id)} />;
}
