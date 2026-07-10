"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionScrollStrip, OptionChoice } from "@/components/products/option-scroll-strip";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";

// B451: «Семейные сценарии» — самодостаточная услуга по паттерну Таро/reframe.
// Genogram-разбор повторов рода (без детерминированного расчёта — это карта-метафора);
// нет бесплатного фрагмента; автосейв; сессии по ?reading=.

export type FamilyResult = SymbolicResult;

const TOPICS = ["семья", "отношения", "родители", "дети", "деньги", "самопознание", "перемены"];

const EXAMPLES_BY_TOPIC: Record<string, string[]> = {
  "семья": ["В семье по женской линии все рано брали ответственность за других и не умели просить помощи."],
  "отношения": ["В роду повторяются холодные браки «ради детей» — я ловлю себя на том же."],
  "родители": ["Из поколения в поколение в семье не говорят о чувствах — и я так же закрываюсь."],
  "дети": ["Боюсь повторить с ребёнком то, что мои родители делали со мной."],
  "деньги": ["В роду деньги всегда были про тревогу и выживание — и у меня так же."],
  "самопознание": ["Какие негласные правила рода я несу, не выбирая их?"],
  "перемены": ["Какой сценарий я НЕ хочу передавать дальше?"],
};
const EXAMPLES_DEFAULT = [
  "Опишите, что повторяется в вашей семье и роду: роли, правила, темы из поколения в поколение.",
  "Что вы замечаете «как у мамы/папы/бабушки» — и в чём узнаёте себя сегодня.",
];
function examplesForTopic(topic: string | null): string[] {
  return (topic && EXAMPLES_BY_TOPIC[topic]) || EXAMPLES_DEFAULT;
}

function composeUserInput(pattern: string, question: string, topic: string | null): string {
  return [
    `Что повторяется в роду: ${pattern.trim()}`,
    question.trim() ? `Вопрос: ${question.trim()}` : "",
    topic ? `Сфера: ${topic}` : "",
  ].filter(Boolean).join("\n");
}

function parseInput(userInput?: string | null): { pattern: string; question: string; topic: string | null } {
  if (!userInput) return { pattern: "", question: "", topic: null };
  return {
    pattern: userInput.match(/Что повторяется в роду:\s*([\s\S]+?)(?:\nВопрос:|\nСфера:|$)/)?.[1]?.trim() ?? userInput.split("\n")[0]?.trim() ?? "",
    question: userInput.match(/Вопрос:\s*(.+)/)?.[1]?.trim() ?? "",
    topic: userInput.match(/Сфера:\s*(.+)/)?.[1]?.trim() ?? null,
  };
}

// Genogram-мотив — символическая карта повторов рода (не расчёт по данным).
function FamilyGenogram({ faded = false }: { faded?: boolean }) {
  const stroke = faded ? "var(--soft-paper-edge)" : "var(--soft-terracotta-dark)";
  const dash = faded ? "3 4" : undefined;
  return (
    <svg viewBox="0 0 320 210" role="img" aria-label="Карта семейных повторов" className="mx-auto block w-full max-w-[320px]">
      <path d="M160 34 L90 94 L160 94 L230 94 L160 34 Z" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1.4" />
      <path d="M90 94 L68 164 M160 94 L160 164 M230 94 L252 164" stroke="var(--soft-paper-edge)" strokeWidth="1.4" />
      <path d="M70 164 C102 132, 130 132, 160 164 C190 132, 220 132, 252 164" fill="none" stroke={stroke} strokeWidth="2.4" strokeDasharray={dash} strokeLinecap="round" />
      {([[160, 34, "правило"], [90, 94, "роль"], [160, 94, "повтор"], [230, 94, "граница"], [68, 164, "вы"], [160, 164, "выбор"], [252, 164, "шаг"]] as Array<[number, number, string]>).map(([x, y, label]) => (
        <g key={label}>
          <circle cx={x} cy={y} r="18" fill="var(--soft-paper-card)" stroke={stroke} strokeWidth="1.3" strokeDasharray={dash} />
          <text x={x} y={y + 4} textAnchor="middle" fontSize="9" fill={faded ? "var(--soft-ink-faint)" : "var(--soft-bordeaux)"}>{faded ? "" : label}</text>
        </g>
      ))}
    </svg>
  );
}

function FamilyTeaser() {
  return (
    <div className="rounded-[16px] border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-center" data-testid="family-teaser" aria-hidden="true">
      <FamilyGenogram faded />
      <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">карта повторов рода появится здесь после оплаты</p>
    </div>
  );
}

export function FamilyScenariosResultView({
  result,
  recap,
  onStartNew,
  creditCost,
}: {
  result: SymbolicResult;
  recap: { pattern: string; question: string; topic: string | null };
  onStartNew: () => void;
  creditCost: number;
}) {
  const recapRows = [
    recap.pattern.trim() ? { label: "Что повторяется", value: recap.pattern.trim() } : null,
    recap.question.trim() ? { label: "Вопрос", value: recap.question.trim() } : null,
    recap.topic ? { label: "Сфера", value: recap.topic } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <SymbolicResultScaffold
      productKey="family-scenarios"
      eyebrow="семейные сценарии"
      heading="Карта повторов вашего рода"
      recapSummary={recap.pattern.trim() ? `Что повторяется: ${recap.pattern.trim()}` : "Ваше описание и вопрос"}
      recapRows={recapRows}
      visual={(
        <figure>
          <div className="rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5"><FamilyGenogram /></div>
          <figcaption className="mt-2 text-center text-xs text-[var(--soft-ink-faint)]">карта повторов рода — символическая схема, не диагноз семьи</figcaption>
        </figure>
      )}
      resultText={result.resultText ?? ""}
      topic={recap.topic}
      creditCost={creditCost}
      repeat={{ ribbon: "разобрать ещё", title: "Разобрать другой сценарий", description: "Свежий разбор по новому родовому узору или вопросу.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function FamilyScenariosActions({ creditCost }: { creditCost: number }) {
  const [pattern, setPattern] = useState("");
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } =
    useSymbolicService("family-scenarios", (userInput) => {
      const parsed = parseInput(userInput);
      setPattern(parsed.pattern);
      setQuestion(parsed.question);
      setTopic(parsed.topic);
    });

  // #3: ввод переживает переход на /login.
  const { clear: clearDraft } = useInputDraft(
    "family-scenarios",
    { pattern, question, topic },
    (draft) => {
      if (typeof draft.pattern === "string") setPattern(draft.pattern);
      if (typeof draft.question === "string") setQuestion(draft.question);
      if (typeof draft.topic === "string") setTopic(draft.topic);
    },
    { active: !result },
  );

  useEffect(() => {
    if (result) return;
    const id = window.setInterval(() => setExampleIdx((i) => i + 1), 3600);
    return () => window.clearInterval(id);
  }, [result]);

  function handleGenerate() {
    if (pattern.trim().length < 10) {
      setMessage("Опишите, что повторяется в роду, хотя бы парой предложений — так разбор будет точнее.");
      return;
    }
    void generate(composeUserInput(pattern, question, topic));
  }

  function startNew() {
    reset();
    clearDraft();
    setPattern("");
    setQuestion("");
    setTopic(null);
  }

  if (result?.resultText) {
    return (
      <FamilyScenariosResultView
        result={result}
        recap={{ pattern, question, topic }}
        onStartNew={startNew}
        creditCost={creditCost}
      />
    );
  }

  const placeholderExamples = examplesForTopic(topic);
  const placeholder = placeholderExamples[exampleIdx % placeholderExamples.length];

  return (
    <div className="soft-card product-order-surface" data-testid="family-scenarios-actions">
      <div className="product-order-head">
        <p className="soft-eyebrow">род · семейные сценарии</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="product-controls">
        <OptionScrollStrip ariaLabel="О чём это">
          {TOPICS.map((t) => (
            <OptionChoice key={t} active={topic === t} disabled={status === "loading"}
              onClick={() => { setTopic(topic === t ? null : t); setExampleIdx(0); }}>
              {t}
            </OptionChoice>
          ))}
        </OptionScrollStrip>

        <label className="soft-eyebrow product-question-label" htmlFor="family-input">что повторяется в вашей семье и роду</label>
        <textarea
          id="family-input"
          value={pattern}
          onChange={(e) => setPattern(e.target.value.slice(0, 4000))}
          placeholder={placeholder}
          rows={3}
          className="soft-question-input product-question-input"
          disabled={status === "loading"}
          data-testid="family-input"
        />

        <label className="soft-eyebrow product-question-label" htmlFor="family-question-input">ваш вопрос (необязательно)</label>
        <textarea
          id="family-question-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 2000))}
          placeholder="Например: какой сценарий я не хочу передавать дальше?"
          rows={2}
          className="soft-question-input product-question-input"
          disabled={status === "loading"}
          data-testid="family-question-input"
        />

        <div className="mt-1">
          <FamilyTeaser />
        </div>

        <div className="product-action-row">
          {hasEntitlement ? (
            <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="family-start">
              {status === "loading" ? "Собираем карту…" : "Открыть семейные сценарии"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="family-scenarios"
              label="Открыть семейные сценарии"
              checkoutSource="family-scenarios-direct"
              creditCost={creditCost}
              onUnlocked={() => {
                setHasEntitlement(true);
                if (pattern.trim()) {
                  handleGenerate();
                } else {
                  setMessage("Доступ открыт. Опишите, что повторяется в роду — и карта появится здесь же.");
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
