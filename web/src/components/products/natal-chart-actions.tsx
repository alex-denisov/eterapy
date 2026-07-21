"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionScrollStrip, OptionChoice } from "@/components/products/option-scroll-strip";
import { ZodiacWheel } from "@/components/products/esoteric-chart-visuals";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import type { NatalWheel } from "@/lib/esoteric-chart";
import { useRotatingPlaceholder } from "@/lib/use-rotating-placeholder";

// B450: «Натальная карта» — самодостаточная услуга по паттерну Таро/reframe.
// Контекст (данные рождения + сфера) собирается ВНУТРИ услуги; бесплатного
// предпросмотра нет — один платный шаг даёт колесо + многоглавный разбор; автосейв в
// Дневник; сессии по ?reading=. Общая логика — в useSymbolicService + SymbolicResultScaffold.

export type NatalResult = SymbolicResult;

const TOPICS = ["самопознание", "работа", "отношения", "любовь", "семья", "деньги", "перемены", "предназначение"];
const NATAL_BIRTH_EXAMPLES = [
  "12.04.1992, 14:35, Москва",
  "03.11.1988, 08:10, Санкт-Петербург",
  "27.06.1995, 21:20, Казань",
];

const MODALITY_BY_KEY: Record<string, string> = {
  aries: "кардинальный", cancer: "кардинальный", libra: "кардинальный", capricorn: "кардинальный",
  taurus: "фиксированный", leo: "фиксированный", scorpio: "фиксированный", aquarius: "фиксированный",
  gemini: "мутабельный", virgo: "мутабельный", sagittarius: "мутабельный", pisces: "мутабельный",
};

export function extractNatalWheel(result: SymbolicResult | null): NatalWheel | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.wheel ?? meta.wheel) as unknown;
  if (!raw || typeof raw !== "object") return null;
  const wheel = raw as { sunSign?: unknown; placements?: unknown };
  if (!wheel.sunSign || !Array.isArray(wheel.placements)) return null;
  return raw as NatalWheel;
}

function composeUserInput(birth: string, topic: string | null): string {
  return [
    `Данные рождения: ${birth.trim()}`,
    topic ? `Сфера: ${topic}` : "",
  ].filter(Boolean).join("\n");
}

function parseNatalInput(userInput?: string | null): { birth: string; topic: string | null } {
  if (!userInput) return { birth: "", topic: null };
  const birth = userInput.match(/Данные рождения:\s*(.+)/)?.[1]?.trim() ?? userInput.split("\n")[0]?.trim() ?? "";
  const topic = userInput.match(/Сфера:\s*(.+)/)?.[1]?.trim() ?? null;
  return { birth, topic };
}

// Тизер-силуэт колеса до оплаты (как рубашки карт у Таро).
function NatalWheelTeaser() {
  return (
    <div
      className="rounded-[16px] border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4"
      data-testid="natal-wheel-teaser"
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 160" className="mx-auto block w-full max-w-[180px]">
        <circle cx="80" cy="80" r="74" fill="none" stroke="var(--soft-paper-edge)" strokeWidth={1.4} strokeDasharray="3 5" />
        <circle cx="80" cy="80" r="50" fill="none" stroke="var(--soft-paper-edge)" strokeWidth={1.2} strokeDasharray="3 5" />
        <text x="80" y="80" textAnchor="middle" dominantBaseline="central" fontSize="30" fill="var(--soft-ink-faint)">?</text>
      </svg>
      <p className="mt-2 text-center text-xs text-[var(--soft-ink-faint)]">карта неба появится здесь после оплаты</p>
    </div>
  );
}

function NatalVisual({ result }: { result: SymbolicResult }) {
  const wheel = extractNatalWheel(result);
  if (!wheel) return null;
  return (
    <div>
      <ZodiacWheel wheel={wheel} />
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="natal-facts">
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">солнце</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{wheel.sunSign.name}</p>
        </div>
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">стихия</p>
          <p className="mt-0.5 text-[0.95rem] capitalize text-[var(--soft-ink)]">{wheel.sunSign.element}</p>
        </div>
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">модальность</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{MODALITY_BY_KEY[wheel.sunSign.key] ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

// Результирующий экран (презентационный — переиспользуется для скриншотов).
export function NatalResultView({
  result,
  recap,
  onStartNew,
  creditCost,
}: {
  result: SymbolicResult;
  recap: { birth: string; topic: string | null };
  onStartNew: () => void;
  creditCost: number;
}) {
  const recapRows = [
    recap.birth.trim() ? { label: "Данные рождения", value: recap.birth.trim() } : null,
    recap.topic ? { label: "Сфера", value: recap.topic } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <SymbolicResultScaffold
      resultId={result.id}
      productKey="natal-chart"
      eyebrow="натальная карта"
      heading="Ваша карта неба"
      recapSummary="Ваши данные рождения"
      recapRows={recapRows}
      visual={<NatalVisual result={result} />}
      resultText={result.resultText ?? ""}
      topic={recap.topic}
      creditCost={creditCost}
      repeat={{ ribbon: "разобрать ещё", title: "Сделать новый разбор", description: "Свежая натальная карта по новым данным и выбранному фокусу.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function NatalChartActions({ creditCost }: { creditCost: number }) {
  const [birth, setBirth] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const birthPlaceholder = useRotatingPlaceholder(NATAL_BIRTH_EXAMPLES, topic ?? "all");

  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } =
    useSymbolicService("natal-chart", (userInput) => {
      const parsed = parseNatalInput(userInput);
      setBirth(parsed.birth);
      setTopic(parsed.topic);
    });

  // #3: ввод переживает переход на /login — сохраняем и восстанавливаем черновик.
  const { clear: clearDraft } = useInputDraft(
    "natal-chart",
    { birth, topic },
    (draft) => {
      if (typeof draft.birth === "string") setBirth(draft.birth);
      if (typeof draft.topic === "string") setTopic(draft.topic);
    },
    { active: !result },
  );

  // B554 п.25: проверка обязательных полей ДО оплаты — иначе баллы списывались
  // на пустой форме и человек только потом узнавал, что данных не хватает.
  function missingInput(): string | null {
    return birth.trim().length < 4 ? "Укажите дату рождения (а лучше — время и город), чтобы построить карту." : null;
  }

  function handleGenerate() {
    const warning = missingInput();
    if (warning) {
      setMessage(warning);
      return;
    }
    void generate(composeUserInput(birth, topic));
  }

  function startNew() {
    reset();
    clearDraft();
    setBirth("");
    setTopic(null);
  }

  if (result?.resultText) {
    return (
      <NatalResultView
        result={result}
        recap={{ birth, topic }}
        onStartNew={startNew}
        creditCost={creditCost}
      />
    );
  }

  return (
    <div className="soft-card product-order-surface" data-testid="natal-chart-actions">
      <div className="product-order-head">
        <p className="soft-eyebrow">астрология · язык тем</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="product-controls">
        <OptionScrollStrip ariaLabel="Фокус натальной карты" label="фокус натальной карты" hint="Выберите сферу, которой уделить больше внимания в полном чтении карты.">
          {TOPICS.map((t) => (
            <OptionChoice key={t} active={topic === t} disabled={status === "loading"}
              onClick={() => setTopic(topic === t ? null : t)}>
              {t}
            </OptionChoice>
          ))}
        </OptionScrollStrip>

        <label className="soft-eyebrow product-question-label" htmlFor="natal-birth-input">дата, время и место рождения</label>
        <input
          id="natal-birth-input"
          value={birth}
          onChange={(e) => setBirth(e.target.value.slice(0, 400))}
          placeholder={birthPlaceholder}
          className="soft-question-input product-question-input product-line-input"
          disabled={status === "loading"}
          data-testid="natal-birth-input"
        />

        <div className="mt-1">
          <NatalWheelTeaser />
        </div>

        <div className="product-action-row">
          {hasEntitlement ? (
            <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="natal-start">
              {status === "loading" ? "Строим карту…" : "Открыть натальную карту"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="natal-chart"
              label="Открыть натальную карту"
              checkoutSource="natal-chart-direct"
              creditCost={creditCost}
              beforePay={missingInput}
              onUnlocked={() => {
                setHasEntitlement(true);
                handleGenerate();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
