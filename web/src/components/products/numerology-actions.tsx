"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionScrollStrip, OptionChoice } from "@/components/products/option-scroll-strip";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import { NUMBER_KEYWORD, type NumerologyPortrait } from "@/lib/numerology";

// B451: «Числовой портрет» — самодостаточная услуга по паттерну Таро/reframe.
// Ядровые числа (путь/выражение/душа) считаются детерминированно (lib/numerology),
// разбор опирается на них; нет бесплатного фрагмента; автосейв; сессии по ?reading=.

export type NumerologyResult = SymbolicResult;

const TOPICS = ["самопознание", "работа", "отношения", "любовь", "семья", "деньги", "перемены", "предназначение"];

export function extractNumerology(result: SymbolicResult | null): NumerologyPortrait | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.numerology ?? meta.numerology) as unknown;
  if (!raw || typeof raw !== "object") return null;
  if (typeof (raw as { lifePath?: unknown }).lifePath !== "number") return null;
  return raw as NumerologyPortrait;
}

function composeUserInput(name: string, birth: string, topic: string | null): string {
  return [
    `Имя: ${name.trim()}`,
    `Дата рождения: ${birth.trim()}`,
    topic ? `Сфера: ${topic}` : "",
  ].filter(Boolean).join("\n");
}

function parseInput(userInput?: string | null): { name: string; birth: string; topic: string | null } {
  if (!userInput) return { name: "", birth: "", topic: null };
  return {
    name: userInput.match(/Имя:\s*(.+)/)?.[1]?.trim() ?? "",
    birth: userInput.match(/Дата рождения:\s*(.+)/)?.[1]?.trim() ?? "",
    topic: userInput.match(/Сфера:\s*(.+)/)?.[1]?.trim() ?? null,
  };
}

function NumberDisc({ value, caption }: { value: number | null; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex size-16 items-center justify-center rounded-full font-heading text-[1.7rem] text-[var(--soft-bordeaux)]"
        style={{ background: "var(--soft-apricot, #F2E2C2)" }}
      >
        {value ?? "—"}
      </div>
      <p className="soft-eyebrow text-[0.58rem]">{caption}</p>
      {value !== null && <p className="text-center text-[11px] leading-snug text-[var(--soft-ink-soft)]">{NUMBER_KEYWORD[value] ?? ""}</p>}
    </div>
  );
}

function NumerologyChart({ portrait }: { portrait: NumerologyPortrait }) {
  return (
    <figure data-testid="numerology-chart">
      <div className="flex flex-wrap items-start justify-center gap-5 rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5">
        <NumberDisc value={portrait.lifePath} caption="путь" />
        <NumberDisc value={portrait.expression} caption="выражение" />
        <NumberDisc value={portrait.soulUrge} caption="душа" />
      </div>
      <figcaption className="mt-2 text-center text-xs text-[var(--soft-ink-faint)]">
        число пути · выражения · души — язык повторов и ритма, не прогноз
      </figcaption>
    </figure>
  );
}

function NumerologyTeaser() {
  return (
    <div
      className="rounded-[16px] border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-center"
      data-testid="numerology-teaser"
      aria-hidden="true"
    >
      <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-dashed border-[var(--soft-paper-edge)] font-heading text-[1.7rem] text-[var(--soft-ink-faint)]">?</div>
      <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">ваши числа появятся здесь после оплаты</p>
    </div>
  );
}

export function NumerologyResultView({
  result,
  recap,
  onStartNew,
  creditCost,
}: {
  result: SymbolicResult;
  recap: { name: string; birth: string; topic: string | null };
  onStartNew: () => void;
  creditCost: number;
}) {
  const portrait = extractNumerology(result);
  const recapRows = [
    recap.name.trim() ? { label: "Имя", value: recap.name.trim() } : null,
    recap.birth.trim() ? { label: "Дата рождения", value: recap.birth.trim() } : null,
    recap.topic ? { label: "Сфера", value: recap.topic } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <SymbolicResultScaffold
      productKey="numerology"
      eyebrow="числовой портрет"
      heading="Ваш числовой портрет"
      recapSummary="Имя и дата рождения"
      recapRows={recapRows}
      visual={portrait ? <NumerologyChart portrait={portrait} /> : undefined}
      resultText={result.resultText ?? ""}
      topic={recap.topic}
      creditCost={creditCost}
      repeat={{ ribbon: "посчитать ещё", title: "Сделать новый портрет", description: "Свежий числовой разбор по новым данным и выбранному фокусу.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function NumerologyActions({ creditCost }: { creditCost: number }) {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [topic, setTopic] = useState<string | null>(null);

  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } =
    useSymbolicService("numerology", (userInput) => {
      const parsed = parseInput(userInput);
      setName(parsed.name);
      setBirth(parsed.birth);
      setTopic(parsed.topic);
    });

  // #3: ввод переживает переход на /login.
  const { clear: clearDraft } = useInputDraft(
    "numerology",
    { name, birth, topic },
    (draft) => {
      if (typeof draft.name === "string") setName(draft.name);
      if (typeof draft.birth === "string") setBirth(draft.birth);
      if (typeof draft.topic === "string") setTopic(draft.topic);
    },
    { active: !result },
  );

  function handleGenerate() {
    if (name.trim().length < 2 || birth.trim().length < 4) {
      setMessage("Укажите имя и дату рождения — по ним считаются ваши числа.");
      return;
    }
    void generate(composeUserInput(name, birth, topic));
  }

  function startNew() {
    reset();
    clearDraft();
    setName("");
    setBirth("");
    setTopic(null);
  }

  if (result?.resultText) {
    return (
      <NumerologyResultView
        result={result}
        recap={{ name, birth, topic }}
        onStartNew={startNew}
        creditCost={creditCost}
      />
    );
  }

  return (
    <div className="soft-card product-order-surface" data-testid="numerology-actions">
      <div className="product-order-head">
        <p className="soft-eyebrow">нумерология · язык чисел</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="product-controls">
        <OptionScrollStrip ariaLabel="Фокус числового портрета" label="фокус числового портрета" hint="Выберите сферу, в которой особенно важно прочитать сочетание ваших чисел.">
          {TOPICS.map((t) => (
            <OptionChoice key={t} active={topic === t} disabled={status === "loading"}
              onClick={() => setTopic(topic === t ? null : t)}>
              {t}
            </OptionChoice>
          ))}
        </OptionScrollStrip>

        <label className="soft-eyebrow product-question-label" htmlFor="numerology-name-input">полное имя</label>
        <input
          id="numerology-name-input"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 120))}
          placeholder="Анна"
          className="soft-question-input product-question-input product-line-input"
          disabled={status === "loading"}
          data-testid="numerology-name-input"
        />

        <label className="soft-eyebrow product-question-label" htmlFor="numerology-birth-input">дата рождения</label>
        <input
          id="numerology-birth-input"
          value={birth}
          onChange={(e) => setBirth(e.target.value.slice(0, 60))}
          placeholder="12.04.1992"
          className="soft-question-input product-question-input product-line-input"
          disabled={status === "loading"}
          data-testid="numerology-birth-input"
        />

        <div className="mt-1">
          <NumerologyTeaser />
        </div>

        <div className="product-action-row">
          {hasEntitlement ? (
            <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="numerology-start">
              {status === "loading" ? "Считаем числа…" : "Открыть числовой портрет"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="numerology"
              label="Открыть числовой портрет"
              checkoutSource="numerology-direct"
              creditCost={creditCost}
              onUnlocked={() => {
                setHasEntitlement(true);
                if (name.trim() && birth.trim()) {
                  handleGenerate();
                } else {
                  setMessage("Доступ открыт. Добавьте имя и дату рождения — и портрет появится здесь же.");
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
