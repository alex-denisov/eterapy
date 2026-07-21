import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { PairScenarioActions } from "@/components/products/pair-scenario-actions";
import { TogetherActions } from "@/components/products/together-actions";
import { MiniAppConfiguredProductFrame } from "@/components/miniapp/product-frame";
import { getPairRelationshipOption, resolvePairScenario } from "@/lib/pair-hub";
import { getV5Product } from "@/lib/v5-products";

export default async function MiniAppPairPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string; dialogueId?: string; scenario?: string; via?: string; relType?: string }>;
}) {
  const search = await searchParams;
  const product = getV5Product("pair");
  if (!product) return null;
  const action = search?.invite
    ? search.via === "outside"
      ? <TogetherActions inviteToken={search.invite} />
      : <CompatibilityActions dialogueId={search.dialogueId ?? null} inviteToken={search.invite} productKey="pair" />
    : <PairScenarioActions initialScenario={resolvePairScenario(search?.scenario)} dialogueId={search?.dialogueId ?? null} relationshipType={getPairRelationshipOption(search?.relType ?? "")?.key ?? "romantic"} />;
  return <MiniAppConfiguredProductFrame product={product}>{action}</MiniAppConfiguredProductFrame>;
}
