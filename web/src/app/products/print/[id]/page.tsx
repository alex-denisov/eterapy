import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { reframeToMarkdown } from "@/lib/reframe-format";
import { PrintTrigger } from "@/components/products/print-trigger";
import { TarotSpreadCards, ZodiacWheel, SynastryWheel } from "@/components/products/esoteric-chart-visuals";
import { HumanDesignBodygraph } from "@/components/products/human-design-bodygraph";
import type { TarotCard } from "@/lib/symbolic-products";
import type { NatalWheel, SynastryWheel as SynastryWheelData } from "@/lib/esoteric-chart";
import type { HumanDesignChart } from "@/lib/human-design-data";

export const dynamic = "force-dynamic";

type MetaBag = Record<string, unknown>;

function generationBag(metadata: unknown): MetaBag {
  if (!metadata || typeof metadata !== "object") return {};
  const meta = metadata as MetaBag;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as MetaBag | undefined;
  return { ...(nested ?? {}), ...meta };
}

function readCards(metadata: unknown): TarotCard[] | null {
  const meta = generationBag(metadata);
  const raw = meta.cards;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cards = raw.filter(
    (c): c is TarotCard => !!c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string",
  );
  return cards.length > 0 ? cards : null;
}

function readWheel(metadata: unknown): NatalWheel | SynastryWheelData | null {
  const meta = generationBag(metadata);
  const raw = meta.wheel;
  if (!raw || typeof raw !== "object") return null;
  const wheel = raw as { kind?: unknown };
  if (wheel.kind === "natal" || wheel.kind === "synastry") return raw as NatalWheel | SynastryWheelData;
  return null;
}

function readHumanDesign(metadata: unknown): HumanDesignChart | null {
  const meta = generationBag(metadata);
  const raw = meta.chart;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { type?: unknown; centers?: unknown };
  if (typeof candidate.type !== "string" || !Array.isArray(candidate.centers)) return null;
  return raw as HumanDesignChart;
}

// Статическая печатная стилизация (константа, не пользовательский ввод).
const PRINT_CSS = `
@page { size: A4; margin: 16mm; }
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; }
}
.print-shell { max-width: 720px; margin: 0 auto; padding: 24px 20px 48px; color: #2d2a26; }
.print-shell h1 { font-size: 1.5rem; margin: 0 0 4px; }
.print-shell .print-meta { color: #7a7068; font-size: 0.8rem; margin-bottom: 24px; }
.print-visual { margin: 0 auto 28px; max-width: 360px; }
`;

export default async function PrintProductResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) notFound();

  const result = await db.productResult.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!result) notFound();

  const rawBody = result.resultText ?? result.previewText ?? "";
  // «Переосмысление» хранит JSON углов — для печати/PDF переводим в markdown.
  const body = result.productKey === "reframe" ? reframeToMarkdown(rawBody) : rawBody;
  const cards = readCards(result.metadata);
  const wheel = readWheel(result.metadata);
  const humanDesign = readHumanDesign(result.metadata);
  const isPreviewOnly = !result.resultText && Boolean(result.previewText);

  return (
    <div className="print-shell" data-testid="product-print-page">
      <style>{PRINT_CSS}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <PrintTrigger />
      </div>

      <h1>{result.title}</h1>
      <p className="print-meta">ETerapy · {new Date(result.updatedAt).toLocaleDateString("ru-RU")}</p>

      {cards && (
        <div className="print-visual">
          <TarotSpreadCards cards={cards} />
        </div>
      )}
      {wheel?.kind === "natal" && (
        <div className="print-visual">
          <ZodiacWheel wheel={wheel} />
        </div>
      )}
      {wheel?.kind === "synastry" && (
        <div className="print-visual">
          <SynastryWheel wheel={wheel} />
        </div>
      )}
      {humanDesign && (
        <div className="print-visual">
          <HumanDesignBodygraph chart={humanDesign} />
        </div>
      )}

      <SoftMarkdown content={body} className="font-heading text-[1.02rem] leading-relaxed" />

      {isPreviewOnly && (
        <p className="no-print" style={{ marginTop: 24, color: "#7a7068", fontSize: "0.85rem" }}>
          Это бесплатный фрагмент. Полный разбор откроется баллами или картой на странице услуги.
        </p>
      )}
    </div>
  );
}
