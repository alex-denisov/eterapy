import { ChatAnalysisActions } from "@/components/products/chat-analysis-actions";
import { DeepReportActions } from "@/components/products/deep-report-actions";
import { FamilyScenariosActions } from "@/components/products/family-scenarios-actions";
import { HoraryActions, TarotNumerologyActions } from "@/components/products/new-symbolic-product-actions";
import { HumanDesignActions } from "@/components/products/human-design-actions";
import { NatalChartActions } from "@/components/products/natal-chart-actions";
import { NumerologyActions } from "@/components/products/numerology-actions";
import { ReframeActions } from "@/components/products/reframe-actions";
import { SurnameStoryActions } from "@/components/products/surname-story-actions";
import { SymbolicProductActions } from "@/components/products/symbolic-product-actions";
import { SynastryActions } from "@/components/products/synastry-actions";
import type { V5Product } from "@/lib/v5-products";

export function MiniAppProductActions({
  product,
  search,
}: {
  product: V5Product;
  search?: { resultId?: string };
}) {
  if (product.slug === "deep-report") return <DeepReportActions resultId={search?.resultId ?? null} />;
  if (product.slug === "reframe") return <ReframeActions resultId={search?.resultId ?? null} />;
  if (product.slug === "chat-analysis") return <ChatAnalysisActions />;
  if (product.slug === "tarot") return <SymbolicProductActions productKey="tarot" title="Расклад Таро" promptLabel="Вопрос для расклада" placeholder="Например: стоит ли мне сейчас менять работу, если внутри много сомнений?" creditCost={product.creditCost ?? 2} />;
  if (product.slug === "natal-chart") return <NatalChartActions creditCost={product.creditCost ?? 2} />;
  if (product.slug === "synastry") return <SynastryActions creditCost={product.creditCost ?? 3} />;
  if (product.slug === "numerology") return <NumerologyActions creditCost={product.creditCost ?? 3} />;
  if (product.slug === "horary") return <HoraryActions creditCost={product.creditCost ?? 2} />;
  if (product.slug === "tarot-numerology") return <TarotNumerologyActions creditCost={product.creditCost ?? 3} />;
  if (product.slug === "family-scenarios") return <FamilyScenariosActions creditCost={product.creditCost ?? 4} />;
  if (product.slug === "human-design") return <HumanDesignActions creditCost={product.creditCost ?? 2} />;
  if (product.slug === "surname-story") return <SurnameStoryActions creditCost={product.creditCost ?? 2} />;
  return null;
}
