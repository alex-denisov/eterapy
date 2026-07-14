"use client";

import { type ReactNode, useState } from "react";
import { MessageSquareText, Sparkles } from "lucide-react";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { SectionAccordion } from "@/components/products/section-accordion";
import { ServiceTriage, type TriagePrimary, type TriageProduct } from "@/components/products/service-triage";
import { getProductPriceLabel } from "@/lib/product-prices";
import { normalizeResultSectionHeadings, splitSections } from "@/lib/report-sections";
import { stripEmbeddedResultDisclaimers } from "@/lib/result-text-sanitize";
import { dialogueTopicFromChip, recommendSecondaryProducts } from "@/lib/product-format-recommendations";

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
  "surname-story": "Как интегрировать код фамилии",
};

const DIRECT_ANSWER_TITLES: Record<string, string> = {
  tarot: "Вердикт расклада",
  "natal-chart": "Главный вывод карты",
  synastry: "Главный вывод о вашей связи",
  numerology: "Главный вывод матрицы",
  horary: "Ответ на поставленный вопрос",
  "tarot-numerology": "Ключевой вывод ваших арканов",
  "human-design": "Главный ключ вашего дизайна",
  "surname-story": "Прямой итог родового аудита",
};

export function presentSymbolicSectionTitle(productKey: string, title: string) {
  return /^Прямой ответ\s*$/iu.test(title.trim())
    ? DIRECT_ANSWER_TITLES[productKey] ?? "Главный вывод"
    : title;
}

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
  const normalizedResultText = stripEmbeddedResultDisclaimers(
    normalizeResultSectionHeadings(productKey, normalizeLegacySymbolicHeadings(productKey, resultText)),
  );
  const sections = splitSections(normalizedResultText).map((section) => ({
    ...section,
    title: presentSymbolicSectionTitle(productKey, section.title),
  }));

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
      <div className="product-order-head">
        <p className="soft-eyebrow">{eyebrow}</p>
      </div>
      <h2 className="soft-h3 mt-1">{heading}</h2>

      {/* Свёрнутый блок с самим запросом пользователя (как у Таро). */}
      <details
        className="product-controls-collapsed mt-4"
        data-testid={`${productKey}-recap`}
        open={recapOpen}
        onToggle={(e) => setRecapOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span className="product-collapsed-question">{recapSummary}</span>
          <span className="product-collapsed-hint">{recapOpen ? "скрыть" : "показать"}</span>
        </summary>
        <dl className="product-recap">
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

    </div>
  );
}
