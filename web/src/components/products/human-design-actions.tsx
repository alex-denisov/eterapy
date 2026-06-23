"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionScrollStrip, OptionChoice } from "@/components/products/option-scroll-strip";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { HumanDesignBodygraph } from "@/components/products/human-design-bodygraph";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import type { HumanDesignChart } from "@/lib/human-design-data";

// B451: «Дизайн человека» — самодостаточная услуга по паттерну Таро/reframe.
// Бодиграф/тип считаются детерминированно (server, по данным рождения), разбор
// опирается на них; нет бесплатного расчёта-тизера — один платный шаг даёт бодиграф +
// многоглавный разбор; автосейв; сессии по ?reading=.

export type HumanDesignResult = SymbolicResult;

const TOPICS = ["самопознание", "работа", "отношения", "энергия", "решения", "отдых", "перемены", "предназначение"];

const EXAMPLES_BY_TOPIC: Record<string, string[]> = {
  "самопознание": ["Хочу понять, как устроен я и почему действую именно так."],
  "работа": ["Как мне работать по своей природе, а не на износ?"],
  "отношения": ["Как я вхожу в близость и что мне в ней важно?"],
  "энергия": ["Почему я быстро выгораю — как восполнять силы?"],
  "решения": ["Как мне принимать решения, чтобы потом не жалеть?"],
  "отдых": ["Как я по-настоящему восстанавливаюсь?"],
  "перемены": ["Сейчас момент действовать или ждать приглашения?"],
  "предназначение": ["В чём моя естественная роль и сила?"],
};
const EXAMPLES_DEFAULT = [
  "Например: как мне жить и решать по своей природе?",
  "Опишите, что хотите прояснить — разбор свяжет ваш дизайн с вопросом.",
];
function examplesForTopic(topic: string | null): string[] {
  return (topic && EXAMPLES_BY_TOPIC[topic]) || EXAMPLES_DEFAULT;
}

export function extractHumanDesignChart(result: SymbolicResult | null): HumanDesignChart | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.chart ?? meta.chart) as unknown;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { type?: unknown; centers?: unknown };
  if (typeof candidate.type !== "string" || !Array.isArray(candidate.centers)) return null;
  return raw as HumanDesignChart;
}

function composeUserInput(birth: string, question: string, topic: string | null): string {
  return [
    `Данные рождения: ${birth.trim()}`,
    question.trim() ? `Вопрос: ${question.trim()}` : "",
    topic ? `Сфера: ${topic}` : "",
  ].filter(Boolean).join("\n");
}

function parseInput(userInput?: string | null): { birth: string; question: string; topic: string | null } {
  if (!userInput) return { birth: "", question: "", topic: null };
  return {
    birth: userInput.match(/Данные рождения:\s*(.+)/)?.[1]?.trim() ?? userInput.split("\n")[0]?.trim() ?? "",
    question: userInput.match(/Вопрос:\s*(.+)/)?.[1]?.trim() ?? "",
    topic: userInput.match(/Сфера:\s*(.+)/)?.[1]?.trim() ?? null,
  };
}

function HumanDesignVisual({ result }: { result: SymbolicResult }) {
  const chart = extractHumanDesignChart(result);
  if (!chart) return null;
  return (
    <div>
      <HumanDesignBodygraph chart={chart} />
      <div className="mt-3 grid grid-cols-2 gap-2.5" data-testid="hd-facts">
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">тип</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{chart.typeName}</p>
        </div>
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">стратегия</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{chart.strategy}</p>
        </div>
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">авторитет</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{chart.authorityName}</p>
        </div>
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">профиль</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{chart.profile} · {chart.profileName}</p>
        </div>
      </div>
      {!chart.hasExactTime && (
        <p className="mt-3 rounded-[12px] bg-[var(--soft-paper-deep)] p-3 text-xs leading-relaxed text-[var(--soft-bordeaux)]">
          Время рождения не указано — тип посчитан на полдень. Для точного результата добавьте точное время и город.
        </p>
      )}
    </div>
  );
}

function BodygraphTeaser() {
  return (
    <div
      className="rounded-[16px] border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-center"
      data-testid="hd-teaser"
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 150" className="mx-auto block w-[110px]">
        {[[60, 18], [60, 48], [38, 80], [82, 80], [60, 104], [60, 132]].map(([x, y], i) => (
          <rect key={i} x={Number(x) - 14} y={Number(y) - 10} width="28" height="20" rx="4" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1.4" strokeDasharray="3 4" />
        ))}
        <text x="60" y="78" textAnchor="middle" dominantBaseline="central" fontSize="22" fill="var(--soft-ink-faint)">?</text>
      </svg>
      <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">ваш бодиграф появится здесь после оплаты</p>
    </div>
  );
}

export function HumanDesignResultView({
  result,
  recap,
  onStartNew,
  creditCost,
}: {
  result: SymbolicResult;
  recap: { birth: string; question: string; topic: string | null };
  onStartNew: () => void;
  creditCost: number;
}) {
  const recapRows = [
    recap.birth.trim() ? { label: "Данные рождения", value: recap.birth.trim() } : null,
    recap.question.trim() ? { label: "Вопрос", value: recap.question.trim() } : null,
    recap.topic ? { label: "Сфера", value: recap.topic } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <SymbolicResultScaffold
      productKey="human-design"
      eyebrow="дизайн человека"
      heading="Ваш дизайн человека"
      recapSummary={recap.question.trim() ? `Вопрос: ${recap.question.trim()}` : "Ваши данные и вопрос"}
      recapRows={recapRows}
      visual={<HumanDesignVisual result={result} />}
      resultText={result.resultText ?? ""}
      topic={recap.topic}
      creditCost={creditCost}
      repeat={{ ribbon: "разобрать ещё", title: "Сделать новый разбор", description: "Свежий разбор дизайна по новым данным или вопросу.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function HumanDesignActions({ creditCost }: { creditCost: number }) {
  const [birth, setBirth] = useState("");
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } =
    useSymbolicService("human-design", (userInput) => {
      const parsed = parseInput(userInput);
      setBirth(parsed.birth);
      setQuestion(parsed.question);
      setTopic(parsed.topic);
    });

  // #3: ввод переживает переход на /login.
  const { clear: clearDraft } = useInputDraft(
    "human-design",
    { birth, question, topic },
    (draft) => {
      if (typeof draft.birth === "string") setBirth(draft.birth);
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
    if (birth.trim().length < 4) {
      setMessage("Укажите дату рождения (а лучше — точное время и город), чтобы рассчитать бодиграф.");
      return;
    }
    void generate(composeUserInput(birth, question, topic));
  }

  function startNew() {
    reset();
    clearDraft();
    setBirth("");
    setQuestion("");
    setTopic(null);
  }

  if (result?.resultText) {
    return (
      <HumanDesignResultView
        result={result}
        recap={{ birth, question, topic }}
        onStartNew={startNew}
        creditCost={creditCost}
      />
    );
  }

  const placeholderExamples = examplesForTopic(topic);
  const placeholder = placeholderExamples[exampleIdx % placeholderExamples.length];

  return (
    <div className="soft-card tarot-order-surface" data-testid="human-design-actions">
      <div className="tarot-head">
        <p className="soft-eyebrow">дизайн человека · язык природы</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="tarot-controls">
        <OptionScrollStrip ariaLabel="О чём хотите понять">
          {TOPICS.map((t) => (
            <OptionChoice key={t} active={topic === t} disabled={status === "loading"}
              onClick={() => { setTopic(topic === t ? null : t); setExampleIdx(0); }}>
              {t}
            </OptionChoice>
          ))}
        </OptionScrollStrip>

        <label className="soft-eyebrow tarot-question-label" htmlFor="hd-birth-input">дата, время и место рождения</label>
        <textarea
          id="hd-birth-input"
          value={birth}
          onChange={(e) => setBirth(e.target.value.slice(0, 400))}
          placeholder="15.05.1990, 10:30, Москва. Точное время и город важны для верного расчёта."
          rows={2}
          className="soft-question-input tarot-question-input"
          disabled={status === "loading"}
          data-testid="hd-birth-input"
        />

        <label className="soft-eyebrow tarot-question-label" htmlFor="hd-question-input">ваш вопрос (необязательно)</label>
        <textarea
          id="hd-question-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 2000))}
          placeholder={placeholder}
          rows={2}
          className="soft-question-input tarot-question-input"
          disabled={status === "loading"}
          data-testid="hd-question-input"
        />

        <div className="mt-1">
          <BodygraphTeaser />
        </div>

        <div className="tarot-action-row">
          {hasEntitlement ? (
            <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="hd-start">
              {status === "loading" ? "Считаем бодиграф…" : "Открыть дизайн человека"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="human-design"
              label="Открыть дизайн человека"
              checkoutSource="human-design-direct"
              creditCost={creditCost}
              onUnlocked={() => {
                setHasEntitlement(true);
                if (birth.trim()) {
                  handleGenerate();
                } else {
                  setMessage("Доступ открыт. Добавьте данные рождения — и бодиграф появится здесь же.");
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
