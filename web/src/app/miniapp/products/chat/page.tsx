import { MiniAppChatScreen } from "@/components/miniapp/chat-screen";

export const dynamic = "force-dynamic";

export default async function MiniAppChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ dialogueId?: string; analysisId?: string; start?: string }>;
}) {
  const search = await searchParams;
  const params = new URLSearchParams();
  if (search?.dialogueId) params.set("dialogueId", search.dialogueId);
  if (search?.analysisId) params.set("analysisId", search.analysisId);
  if (search?.start === "1") params.set("start", "1");
  const query = params.toString();
  const loginNext = `/miniapp/products/chat${query ? `?${query}` : ""}`;
  return (
    <MiniAppChatScreen
      dialogueId={search?.dialogueId ?? null}
      analysisId={search?.analysisId ?? null}
      autoStart={search?.start === "1"}
      loginNext={loginNext}
    />
  );
}
