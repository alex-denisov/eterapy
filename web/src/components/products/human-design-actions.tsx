"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { HumanDesignBodygraph } from "@/components/products/human-design-bodygraph";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import type { HumanDesignChart } from "@/lib/human-design-data";
import { personalizeHumanDesignResultHeadings } from "@/lib/human-design-result";
import { useRotatingPlaceholder } from "@/lib/use-rotating-placeholder";
import { maskLeadingDateInput } from "@/lib/date-input-mask";

const HUMAN_DESIGN_BIRTH_EXAMPLES = [
  "15.05.1990, 10:30, Москва",
  "18.08.1991, 07:20, Самара",
  "24.09.1994, 06:45, Екатеринбург",
];

// B451: «Дизайн человека» — самодостаточная услуга по паттерну Таро/reframe.
// Бодиграф/тип считаются детерминированно (server, по данным рождения), разбор
// опирается на них; нет бесплатного расчёта-тизера — один платный шаг даёт бодиграф +
// многоглавный разбор; автосейв; сессии по ?reading=.

export type HumanDesignResult = SymbolicResult;

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

function composeUserInput(birth: string): string {
  return `Данные рождения: ${birth.trim()}`;
}

function parseInput(userInput?: string | null): { birth: string } {
  if (!userInput) return { birth: "" };
  return { birth: userInput.match(/Данные рождения:\s*(.+)/)?.[1]?.trim() ?? userInput.split("\n")[0]?.trim() ?? "" };
}

function HumanDesignVisual({ result }: { result: SymbolicResult }) {
  const chart = extractHumanDesignChart(result);
  if (!chart) return null;
  const facts = [
    { label: "тип", value: chart.typeName },
    { label: "стратегия", value: chart.strategy },
    { label: "авторитет", value: chart.authorityName },
    { label: "профиль", value: `${chart.profile} · ${chart.profileName}` },
    { label: "определение", value: chart.definition },
  ];
  return (
    <div>
      <HumanDesignBodygraph chart={chart} />
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="human-design-facts">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
            <p className="soft-eyebrow text-[0.6rem]">{fact.label}</p>
            <p className="mt-0.5 text-[0.95rem] leading-snug text-[var(--soft-ink)]">{fact.value}</p>
          </div>
        ))}
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
  recap: { birth: string };
  onStartNew?: () => void;
  creditCost: number;
}) {
  const chart = extractHumanDesignChart(result);
  const recapRows = [
    recap.birth.trim() ? { label: "Данные рождения", value: recap.birth.trim() } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <SymbolicResultScaffold
      resultId={result.id}
      productKey="human-design"
      eyebrow="дизайн человека"
      heading="Ваш дизайн человека"
      recapSummary="Ваши данные рождения"
      recapRows={recapRows}
      visual={<HumanDesignVisual result={result} />}
      resultText={personalizeHumanDesignResultHeadings(result.resultText ?? "", chart)}
      topic={null}
      creditCost={creditCost}
      repeat={{ ribbon: "разобрать ещё", title: "Сделать новый разбор", description: "Свежий разбор бодиграфа по новым данным рождения.", ctaLabel: "Начать" }}
      onStartNew={onStartNew ?? (() => undefined)}
    />
  );
}

export function HumanDesignActions({ creditCost }: { creditCost: number }) {
  const [birth, setBirth] = useState("");
  const birthPlaceholder = useRotatingPlaceholder(HUMAN_DESIGN_BIRTH_EXAMPLES, "human-design");

  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } =
    useSymbolicService("human-design", (userInput) => {
      const parsed = parseInput(userInput);
      setBirth(parsed.birth);
    });

  // #3: ввод переживает переход на /login.
  const { clear: clearDraft } = useInputDraft(
    "human-design",
    { birth },
    (draft) => {
      if (typeof draft.birth === "string") setBirth(draft.birth);
    },
    { active: !result },
  );

  function handleGenerate() {
    if (birth.trim().length < 4) {
      setMessage("Укажите дату рождения (а лучше — точное время и город), чтобы рассчитать бодиграф.");
      return;
    }
    void generate(composeUserInput(birth));
  }

  function startNew() {
    reset();
    clearDraft();
    setBirth("");
  }

  if (result?.resultText) {
    return (
      <HumanDesignResultView
        result={result}
        recap={{ birth }}
        onStartNew={startNew}
        creditCost={creditCost}
      />
    );
  }

  return (
    <div className="soft-card product-order-surface" data-testid="human-design-actions">
      <div className="product-order-head">
        <p className="soft-eyebrow">дизайн человека · язык природы</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="product-controls">
        <label className="soft-eyebrow product-question-label" htmlFor="hd-birth-input">дата, время и место рождения</label>
        <input
          id="hd-birth-input"
          value={birth}
          // B554 п.23: составное поле — маска только на ведущую дату.
          onChange={(e) => setBirth(maskLeadingDateInput(e.target.value.slice(0, 400), birth))}
          placeholder={birthPlaceholder}
          className="soft-question-input product-question-input product-line-input"
          disabled={status === "loading"}
          data-testid="hd-birth-input"
        />

        <div className="mt-1">
          <BodygraphTeaser />
        </div>

        <div className="product-action-row">
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
