import { CompanionChatPanel } from "@/components/companion/companion-chat-panel";
import { MiniAppProductFrame } from "@/components/miniapp/product-frame";
import { CHAT_SESSION_COST_CREDITS } from "@/lib/chat-session";
import { getProductPriceLabel } from "@/lib/product-prices";

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
    <MiniAppProductFrame title="Решить вопрос в чате" eyebrow="живой диалог в своём темпе" price={getProductPriceLabel("chat-session") ?? "790 ₽"} priceMeta={`или −${CHAT_SESSION_COST_CREDITS} балла`}>
      <CompanionChatPanel dialogueId={search?.dialogueId ?? null} analysisId={search?.analysisId ?? null} autoStart={search?.start === "1"} loginNext={loginNext} />
    </MiniAppProductFrame>
  );
}
