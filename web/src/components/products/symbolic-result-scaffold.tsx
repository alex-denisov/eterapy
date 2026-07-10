"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { BookOpen, MessageSquareText, Sparkles } from "lucide-react";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { SectionAccordion } from "@/components/products/section-accordion";
import { ServiceTriage, type TriagePrimary, type TriageProduct } from "@/components/products/service-triage";
import { getProductPriceLabel } from "@/lib/product-prices";
import { splitSections } from "@/lib/report-sections";
import { stripEmbeddedResultDisclaimers } from "@/lib/result-text-sanitize";
import { dialogueTopicFromChip, recommendSecondaryProducts } from "@/lib/product-format-recommendations";
import { appUrl } from "@/lib/subdomain";

// B451: общий результирующий экран символической услуги (паттерн Таро/reframe):
// заголовок + свёрнутый запрос (recap) + визуализация + навигация-аккордеон по
// главам + рекомендации (ServiceTriage) + строка автосейва в Дневник.

export type RecapRow = { label: string; value: string };

const LEGACY_FINAL_SECTION_TITLES: Record<string, string> = {
  tarot: "Как действовать по раскладу",
  numerology: "Практический ориентир на ближайшее время",
  "natal-chart": "Как работать с этой картой дальше",
  synastry: "Что проверить в реальном разговоре",
  "human-design": "Как применять дизайн",
  "surname-story": "Что проверить в семейной истории",
};

function normalizeLegacySymbolicHeadings(productKey: string, text: string): string {
  const replacement = LEGACY_FINAL_SECTION_TITLES[productKey];
  if (!replacement) return text;
  return text
    .replace(/^##\s+Бережный шаг\s*$/gim, `## ${replacement}`)
    .replace(/^##\s+Бережные шаги(?:\s+на\s+ближайшее\s+время)?\s*$/gim, `## ${replacement}`)
    .replace(/^##\s+Бережные шаги\s+для\s+пары\s*$/gim, `## ${replacement}`);
}

export function SymbolicResultScaffold({
  productKey,
  eyebrow,
  heading,
  recapSummary,
  recapRows,
  visual,
  resultText,
  topic,
  creditCost,
  repeat,
  onStartNew,
}: {
  productKey: string;
  eyebrow: string;
  heading: string;
  recapSummary: string;
  recapRows: RecapRow[];
  visual?: ReactNode;
  resultText: string;
  topic: string | null;
  creditCost: number;
  repeat: { ribbon: string; title: string; description: string; ctaLabel: string };
  onStartNew: () => void;
}) {
  const [recapOpen, setRecapOpen] = useState(false);
  const normalizedResultText = stripEmbeddedResultDisclaimers(normalizeLegacySymbolicHeadings(productKey, resultText));
  const sections = splitSections(normalizedResultText);

  const topicKey = dialogueTopicFromChip(topic);
  const triagePrimary: TriagePrimary[] = [
    {
      key: "repeat",
      testId: `${productKey}-new-reading`,
      ribbon: repeat.ribbon,
      icon: Sparkles,
      title: repeat.title,
      description: repeat.description,
      priceMain: getProductPriceLabel(productKey),
      priceSub: `${creditCost} балла за разбор`,
      ctaLabel: repeat.ctaLabel,
      onClick: onStartNew,
    },
    {
      key: "chat",
      testId: `${productKey}-continue-chat`,
      ribbon: "продолжить в диалоге",
      icon: MessageSquareText,
      title: "Продолжить разговор в чате",
      description: "Живой диалог в своём темпе — 45 минут, чтобы разобрать тему глубже.",
      priceMain: "790 ₽",
      priceSub: "45 мин · или 4 балла",
      ctaLabel: "Начать",
      href: "/products/chat",
    },
  ];
  const triageSecondary: TriageProduct[] = recommendSecondaryProducts(topicKey, productKey, 4)
    .filter((item) => item.slug !== productKey)
    .slice(0, 3)
    .map((item) => ({ slug: item.slug, name: item.name, href: item.href, price: item.price, creditCost: item.creditCost }));

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid={`${productKey}-actions`}>
      <div className="tarot-head">
        <p className="soft-eyebrow">{eyebrow}</p>
      </div>
      <h2 className="soft-h3 mt-1">{heading}</h2>

      {/* Свёрнутый блок с самим запросом пользователя (как у Таро). */}
      <details
        className="tarot-controls-collapsed mt-4"
        data-testid={`${productKey}-recap`}
        open={recapOpen}
        onToggle={(e) => setRecapOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span className="tarot-collapsed-q">{recapSummary}</span>
          <span className="tarot-collapsed-hint">{recapOpen ? "скрыть" : "показать"}</span>
        </summary>
        <dl className="tarot-recap">
          {recapRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </details>

      {visual && <div className="mt-5">{visual}</div>}

      <div className="mt-5">
        {sections.length > 0 ? (
          <SectionAccordion sections={sections} testId={`${productKey}-accordion`} itemTestId={`${productKey}-section`} />
        ) : (
          <article className="soft-card rounded-[16px] p-6 font-heading text-[1.05rem] leading-relaxed text-[var(--soft-ink)]">
            <SoftMarkdown content={normalizedResultText} />
          </article>
        )}
      </div>

      <ServiceTriage
        eyebrow="что дальше"
        testId={`${productKey}-triage`}
        primary={triagePrimary}
        secondary={triageSecondary}
        specialistHref="/practitioners"
      />

      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs text-[var(--soft-ink-faint)]">
        <BookOpen className="size-3.5" aria-hidden="true" />
        <span>Разбор сохранён в</span>
        <Link href={appUrl("/diary")} className="font-medium text-[var(--soft-ink-soft)] underline-offset-2 hover:underline">дневнике</Link>
        <span>— там его можно перечитать, скачать PDF или удалить.</span>
      </p>
    </div>
  );
}
