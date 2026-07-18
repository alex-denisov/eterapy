import { DialogueDetailScreen } from "@/components/miniapp/journey-screens";

export default async function MiniAppDialoguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DialogueDetailScreen dialogueId={decodeURIComponent(id)} />;
}
