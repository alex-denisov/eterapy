"use client";

import { useId, useRef, useState } from "react";
import { ArrowRight, Coins, GitCompareArrows, Shield, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptionChoice, OptionScrollStrip } from "@/components/products/option-scroll-strip";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import {
  analyzeSurname,
  computeSurnameCode,
  parseSurnameAuditInput,
  type ParsedSurnameAuditInput,
  type SurnameAuditMode,
  type SurnameCode,
  type SurnameStory,
} from "@/lib/surname-story";
import { useRotatingPlaceholder } from "@/lib/use-rotating-placeholder";

const AUDIT_MODES: Array<{ value: SurnameAuditMode; label: string }> = [
  { value: "resource", label: "Моя фамилия" },
  { value: "change", label: "Смена фамилии" },
  { value: "name", label: "Имя + фамилия" },
  { value: "alias", label: "Псевдоним / бренд" },
];

const AUDIT_FOCUS: Record<SurnameAuditMode, string[]> = {
  resource: ["родовой ресурс", "деньги и реализация", "семейный сценарий", "границы"],
  change: ["характер", "деньги", "отношения с родом", "публичный образ"],
  name: ["характер сочетания", "отношения", "реализация", "внутренний конфликт"],
  alias: ["узнаваемость", "продажи", "экспертность", "творчество"],
};

const NAME_EXAMPLES = ["Мария", "Анна", "Елена", "Алёна"];
const SURNAME_EXAMPLES = ["Соколова", "Морозова", "Ковальчук", "Алиева"];
const SECONDARY_EXAMPLES: Record<"change" | "alias", string[]> = {
  change: ["Волкова", "Орлова", "Лебедева", "Романова"],
  alias: ["Лада Север", "Вера Форма", "Студия Маяк", "Мария Волна"],
};
const CONTEXT_EXAMPLES: Record<SurnameAuditMode, string[]> = {
  resource: [
    "Какой ресурс рода я недооцениваю?",
    "Какой семейный сценарий мешает мне зарабатывать?",
    "Что я повторяю за женщинами своего рода?",
  ],
  change: [
    "Что усилится после смены фамилии?",
    "Что я сохраню от прежней фамилии?",
    "Как изменится мой денежный сценарий?",
  ],
  name: [
    "Где имя усиливает фамилию, а где спорит с ней?",
    "Как сочетание проявляется в отношениях?",
    "Какой образ создаёт полное имя?",
  ],
  alias: [
    "Хочу усилить узнаваемость экспертного блога",
    "Ищу имя для творческого проекта",
    "Нужен более уверенный публичный образ",
  ],
};

type AuditRecap = ParsedSurnameAuditInput;
type SealLayerKey = "resource" | "shadow" | "money" | "relations";

const svgCoordinate = (value: number) => Number(value.toFixed(4));

const BASE_CODE_LAYERS: Record<number, Record<SealLayerKey, string>> = {
  1: { resource: "инициатива", shadow: "давление", money: "первенство", relations: "автономия" },
  2: { resource: "чуткость", shadow: "зависимость", money: "партнёрство", relations: "согласование" },
  3: { resource: "созидание", shadow: "распыление", money: "видимость", relations: "выражение" },
  4: { resource: "структура", shadow: "жёсткость", money: "система", relations: "надёжность" },
  5: { resource: "движение", shadow: "хаос", money: "обмен", relations: "свобода" },
  6: { resource: "забота", shadow: "контроль", money: "ответственность", relations: "лояльность" },
  7: { resource: "глубина", shadow: "изоляция", money: "экспертиза", relations: "дистанция" },
  8: { resource: "влияние", shadow: "власть", money: "масштаб", relations: "границы" },
  9: { resource: "смысл", shadow: "спасательство", money: "польза", relations: "завершение" },
};

const LAYER_META: Array<{ key: SealLayerKey; label: string; icon: typeof Sparkles; detail: string }> = [
  { key: "resource", label: "Ресурс", icon: Sparkles, detail: "Качество, которое символически легче всего сделать опорой и передать дальше." },
  { key: "shadow", label: "Тень", icon: Shield, detail: "Поведение, в которое код уходит при перегрузе, страхе или борьбе за признание." },
  { key: "money", label: "Деньги", icon: Coins, detail: "Не сумма дохода, а сценарий риска, контроля, заметности и обмена ценностью." },
  { key: "relations", label: "Отношения", icon: Users, detail: "Типичная семейная роль, способ держать границы и просить поддержку." },
];

export type SurnameResult = SymbolicResult;

function metadataObject(result: SymbolicResult | null) {
  const metadata = result?.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  return ((meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined) ?? meta;
}

export function extractSurnameStory(result: SymbolicResult | null): SurnameStory | null {
  const raw = metadataObject(result)?.surname;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<SurnameStory>;
  if (typeof candidate.surname !== "string" || typeof candidate.originKind !== "string") return null;
  if (candidate.code?.method) return raw as SurnameStory;
  const recalculated = analyzeSurname(candidate.surname);
  return recalculated ? { ...recalculated, ...candidate, code: recalculated.code } as SurnameStory : null;
}

export function extractComparisonCode(result: SymbolicResult | null): SurnameCode | null {
  const raw = metadataObject(result)?.surnameComparison;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<SurnameCode>;
  return typeof candidate.source === "string" && typeof candidate.sum === "number" && typeof candidate.arcanaName === "string"
    ? raw as SurnameCode
    : null;
}

function composeUserInput(input: AuditRecap) {
  const comparisonLabel = input.mode === "change" ? "Новая фамилия" : "Новый вариант";
  return [
    `Режим: ${input.mode}`,
    input.name.trim() ? `Имя: ${input.name.trim()}` : "",
    `Фамилия: ${input.surname.trim()}`,
    input.comparison.trim() ? `${comparisonLabel}: ${input.comparison.trim()}` : "",
    input.focus.trim() ? `Фокус: ${input.focus.trim()}` : "",
    input.context.trim() ? `Контекст: ${input.context.trim()}` : "",
  ].filter(Boolean).join("\n");
}

function emptyAudit(mode: SurnameAuditMode = "resource"): AuditRecap {
  return { mode, name: "", surname: "", comparison: "", focus: "", context: "" };
}

function SealSvg({ code, compact = false }: { code: SurnameCode; compact?: boolean }) {
  const id = useId().replace(/:/gu, "");
  const sizeClass = compact ? "lineage-seal-svg is-compact" : "lineage-seal-svg";
  const radius = 202;
  return (
    <svg viewBox="0 0 520 520" className={sizeClass} role="img" aria-label={`${code.source}: код ${code.baseNumber}, Аркан ${code.arcanaName}`}>
      <defs>
        <radialGradient id={`${id}-paper`} cx="50%" cy="45%" r="58%">
          <stop offset="0" stopColor="var(--soft-paper-card)" />
          <stop offset=".7" stopColor="var(--soft-paper-deep)" stopOpacity=".78" />
          <stop offset="1" stopColor="var(--soft-paper-deep)" stopOpacity=".12" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>
      <circle cx="260" cy="260" r="244" fill={`url(#${id}-paper)`} />
      <circle cx="260" cy="260" r="220" className="lineage-seal-ring is-outer" />
      <circle cx="260" cy="260" r="176" className="lineage-seal-ring is-letter" />
      <circle cx="260" cy="260" r="134" className="lineage-seal-ring is-code" />
      {Array.from({ length: 22 }, (_, index) => {
        const angle = (-90 + index * (360 / 22)) * Math.PI / 180;
        const active = index + 1 === code.arcanaIndex;
        return <line key={index} x1={svgCoordinate(260 + Math.cos(angle) * (active ? 214 : 218))} y1={svgCoordinate(260 + Math.sin(angle) * (active ? 214 : 218))} x2={svgCoordinate(260 + Math.cos(angle) * (active ? 231 : 226))} y2={svgCoordinate(260 + Math.sin(angle) * (active ? 231 : 226))} className={`lineage-seal-arcana-tick ${active ? "is-active" : ""}`} />;
      })}
      {code.letters.map((item, index) => {
        const angle = -90 + index * (360 / code.letters.length);
        const radians = angle * Math.PI / 180;
        const x = svgCoordinate(260 + Math.cos(radians) * radius);
        const y = svgCoordinate(260 + Math.sin(radians) * radius);
        return (
          <g key={`${item.letter}-${index}`} transform={`translate(${x} ${y})`}>
            <circle r={item.kind === "vowel" ? 15 : 12} className={`lineage-seal-letter-dot is-${item.kind}`} />
            <text y="-1" textAnchor="middle" className="lineage-seal-letter">{item.letter}</text>
            <text y="12" textAnchor="middle" className="lineage-seal-letter-value">{item.value}</text>
          </g>
        );
      })}
      {Array.from({ length: 9 }, (_, index) => {
        const angle = (-90 + index * 40) * Math.PI / 180;
        const active = index + 1 === code.baseNumber;
        return <circle key={index} cx={svgCoordinate(260 + Math.cos(angle) * 153)} cy={svgCoordinate(260 + Math.sin(angle) * 153)} r={active ? 8 : 3.5} className={`lineage-seal-code-dot ${active ? "is-active" : ""}`} />;
      })}
      <circle cx="260" cy="260" r="104" className="lineage-seal-core-glow" filter={`url(#${id}-glow)`} />
      <circle cx="260" cy="260" r="101" className="lineage-seal-core" />
      <text x="260" y="224" textAnchor="middle" className="lineage-seal-arcana-glyph">{code.arcanaGlyph}</text>
      <text x="260" y="266" textAnchor="middle" className="lineage-seal-number">{code.baseNumber}</text>
      <text x="260" y="294" textAnchor="middle" className="lineage-seal-arcana-name">{code.arcanaName}</text>
      <text x="260" y="322" textAnchor="middle" className="lineage-seal-source">{code.source}</text>
    </svg>
  );
}

function LetterLedger({ code }: { code: SurnameCode }) {
  return (
    <div className="lineage-ledger" aria-label={`Формула ${code.source}`}>
      <div className="lineage-ledger-letters">
        {code.letters.map((item, index) => <span key={`${item.letter}-${index}`}><b>{item.letter}</b><small>{item.value}</small></span>)}
      </div>
      <p><span>Сумма {code.sum}</span><span>Код {code.baseNumber}</span><span>Аркан {code.arcanaIndex}</span></p>
    </div>
  );
}

export function SurnameLineageVisual({ story, comparison, mode = "resource" }: { story: SurnameStory; name?: string; comparison?: SurnameCode | null; mode?: SurnameAuditMode }) {
  const visualId = useId().replace(/:/gu, "");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const layerValues = BASE_CODE_LAYERS[story.code.baseNumber];
  const selected = LAYER_META[selectedIndex];

  function selectFromKeyboard(index: number, key: string) {
    let next = index;
    if (key === "ArrowRight" || key === "ArrowDown") next = (index + 1) % LAYER_META.length;
    else if (key === "ArrowLeft" || key === "ArrowUp") next = (index - 1 + LAYER_META.length) % LAYER_META.length;
    else if (key === "Home") next = 0;
    else if (key === "End") next = LAYER_META.length - 1;
    else return;
    setSelectedIndex(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <figure className={`lineage-seal ${comparison ? "has-comparison" : ""}`} data-testid="surname-identity-map" aria-label={`Родовая печать ${story.surname}`}>
      <div className="lineage-seal-stage">
        {comparison ? (
          <div className="lineage-seal-comparison" data-testid="surname-code-comparison">
            <div><p className="soft-eyebrow">сейчас</p><SealSvg code={story.code} compact /><LetterLedger code={story.code} /></div>
            <div className="lineage-transition" aria-label="Изменение кода">
              <span>{story.code.baseNumber} → {comparison.baseNumber}</span>
              <small>{story.code.arcanaName}<br />→ {comparison.arcanaName}</small>
            </div>
            <div><p className="soft-eyebrow">{mode === "change" ? "после смены" : "новый образ"}</p><SealSvg code={comparison} compact /><LetterLedger code={comparison} /></div>
          </div>
        ) : (
          <div className="lineage-seal-single"><SealSvg code={story.code} /><LetterLedger code={story.code} /></div>
        )}

        <div className="lineage-seal-index" role="tablist" aria-label="Слои родовой печати">
          {LAYER_META.map((layer, index) => {
            const Icon = layer.icon;
            return (
              <button
                key={layer.key}
                ref={(node) => { tabRefs.current[index] = node; }}
                type="button"
                role="tab"
                aria-selected={selectedIndex === index}
                aria-controls={`${visualId}-panel`}
                tabIndex={selectedIndex === index ? 0 : -1}
                className={selectedIndex === index ? "is-active" : ""}
                onClick={() => setSelectedIndex(index)}
                onKeyDown={(event) => selectFromKeyboard(index, event.key)}
              >
                <Icon aria-hidden="true" />
                <span>{layer.label}<small>{layerValues[layer.key]}</small></span>
              </button>
            );
          })}
        </div>

        <div id={`${visualId}-panel`} role="tabpanel" className="lineage-seal-detail" data-testid="surname-facts">
          <p className="soft-eyebrow">символический слой · код {story.code.baseNumber}</p>
          <div><h3>{selected.label}: {layerValues[selected.key]}</h3><span>{story.code.arcanaGlyph} {story.code.arcanaName}</span></div>
          <p>{selected.detail} Для этой фамилии слой читается через код {story.code.baseNumber} и сюжет Аркана «{story.code.arcanaName}».</p>
        </div>

        <p className="lineage-method-note">Метод {story.code.method}. Расчёт букв и Аркана точен внутри выбранной системы; трактовка ресурса и тени является эзотерической интерпретацией.</p>
      </div>
    </figure>
  );
}

function SurnameTeaser({ surname, comparison, mode }: { surname: string; comparison: string; mode: SurnameAuditMode }) {
  const primaryCode = computeSurnameCode(surname);
  const comparisonCode = comparison ? computeSurnameCode(comparison) : null;
  return (
    <div className="lineage-teaser" data-testid="surname-teaser">
      {primaryCode ? (
        <>
          <div className="lineage-teaser-visual"><SealSvg code={primaryCode} compact />{comparisonCode && <SealSvg code={comparisonCode} compact />}</div>
          <div className="lineage-teaser-copy">
            <p className="soft-eyebrow">ваша родовая печать</p>
            <h3>Код {primaryCode.baseNumber} · {primaryCode.arcanaGlyph} {primaryCode.arcanaName}</h3>
            <p>{primaryCode.letters.map((item) => `${item.letter}${item.value}`).join(" · ")} = {primaryCode.sum}</p>
            {comparisonCode && <p className="lineage-teaser-compare"><GitCompareArrows aria-hidden="true" /> Второй вариант: код {comparisonCode.baseNumber}, {comparisonCode.arcanaName}</p>}
          </div>
        </>
      ) : (
        <div className="lineage-teaser-empty">
          <div className="lineage-teaser-orbit" aria-hidden="true"><span /><span /><span /></div>
          <div><p className="soft-eyebrow">родовая печать</p><h3>Введите фамилию</h3><p>Буквы займут свои места, а формула и Аркан появятся сразу.</p></div>
        </div>
      )}
      {mode === "change" && !comparisonCode && primaryCode && <p className="lineage-teaser-hint">Добавьте новую фамилию, чтобы увидеть две печати и мост изменений.</p>}
    </div>
  );
}

export function SurnameStoryResultView({ result, recap, onStartNew, creditCost }: { result: SymbolicResult; recap: AuditRecap; onStartNew: () => void; creditCost: number }) {
  const story = extractSurnameStory(result);
  const comparison = extractComparisonCode(result);
  const modeLabel = AUDIT_MODES.find((item) => item.value === recap.mode)?.label ?? "Моя фамилия";
  const recapRows = [
    { label: "Сценарий", value: modeLabel },
    recap.surname.trim() ? { label: recap.mode === "change" ? "Фамилия сейчас" : "Фамилия", value: recap.surname.trim() } : null,
    recap.comparison.trim() ? { label: recap.mode === "change" ? "Фамилия после смены" : "Новый вариант", value: recap.comparison.trim() } : null,
    recap.name.trim() ? { label: "Имя", value: recap.name.trim() } : null,
    recap.focus.trim() ? { label: "Фокус", value: recap.focus.trim() } : null,
    recap.context.trim() ? { label: "Контекст", value: recap.context.trim() } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
  return (
    <SymbolicResultScaffold
      resultId={result.id}
      productKey="surname-origin"
      eyebrow="число фамилии · Старший Аркан · родовой сценарий"
      heading="Кармический аудит рода"
      recapSummary="Источник расчёта"
      recapRows={recapRows}
      visual={story ? <SurnameLineageVisual story={story} comparison={comparison} mode={recap.mode} /> : undefined}
      resultText={result.resultText ?? ""}
      topic={recap.context || recap.focus || null}
      creditCost={creditCost}
      repeat={{ ribbon: "новый код", title: "Рассчитать другой вариант", description: "Сравните другую фамилию, сочетание или публичное имя.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function SurnameStoryActions({ creditCost }: { creditCost: number }) {
  const [audit, setAudit] = useState<AuditRecap>(emptyAudit());
  const modeKey = audit.mode;
  const namePlaceholder = useRotatingPlaceholder(NAME_EXAMPLES, `surname-name-${modeKey}`);
  const surnamePlaceholder = useRotatingPlaceholder(SURNAME_EXAMPLES, `surname-${modeKey}`);
  const comparisonPlaceholder = useRotatingPlaceholder(modeKey === "alias" ? SECONDARY_EXAMPLES.alias : SECONDARY_EXAMPLES.change, `surname-comparison-${modeKey}`);
  const contextPlaceholder = useRotatingPlaceholder(CONTEXT_EXAMPLES[modeKey], `surname-context-${modeKey}`);
  const setField = <K extends keyof AuditRecap>(key: K, value: AuditRecap[K]) => setAudit((current) => ({ ...current, [key]: value }));

  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } = useSymbolicService("surname-origin", (userInput) => {
    setAudit(parseSurnameAuditInput(userInput));
  });
  const { clear: clearDraft } = useInputDraft("surname-origin", audit, (draft) => {
    const mode = draft.mode === "change" || draft.mode === "name" || draft.mode === "alias" ? draft.mode : "resource";
    setAudit({
      mode,
      name: typeof draft.name === "string" ? draft.name : "",
      surname: typeof draft.surname === "string" ? draft.surname : "",
      comparison: typeof draft.comparison === "string" ? draft.comparison : "",
      focus: typeof draft.focus === "string" ? draft.focus : "",
      context: typeof draft.context === "string" ? draft.context : "",
    });
  }, { active: !result });

  function handleGenerate() {
    const primaryCode = computeSurnameCode(audit.surname);
    const needsComparison = audit.mode === "change" || audit.mode === "alias";
    const comparisonCode = needsComparison ? computeSurnameCode(audit.comparison) : null;
    if (!primaryCode) {
      setMessage("Укажите фамилию кириллицей: по её буквам строится код.");
      return;
    }
    if (needsComparison && !comparisonCode) {
      setMessage(audit.mode === "change" ? "Укажите фамилию после смены." : "Укажите псевдоним или название кириллицей.");
      return;
    }
    if (comparisonCode?.normalized === primaryCode.normalized) {
      setMessage("Варианты совпадают. Укажите разные написания для сравнения.");
      return;
    }
    if (!audit.focus) {
      setMessage("Выберите, какой слой разобрать подробнее.");
      return;
    }
    void generate(composeUserInput(audit));
  }

  function startNew() {
    reset();
    clearDraft();
    setAudit(emptyAudit());
  }

  if (result?.resultText) return <SurnameStoryResultView result={result} recap={audit} onStartNew={startNew} creditCost={creditCost} />;

  const showName = audit.mode === "name" || audit.mode === "change" || audit.mode === "resource";
  const showComparison = audit.mode === "change" || audit.mode === "alias";
  const primaryLabel = audit.mode === "alias" ? "как вас знают сейчас" : audit.mode === "change" ? "фамилия сейчас или при рождении" : "ваша фамилия";
  return (
    <div className="soft-card product-order-surface lineage-audit-intake" data-testid="surname-story-actions">
      <div className="product-order-head"><p className="soft-eyebrow">происхождение фамилии · число рода · Аркан</p></div>
      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
      <div className="product-controls">
        <OptionScrollStrip ariaLabel="Сценарий кармического кода" label="что вы хотите рассчитать" hint="Режим меняет поля и сравнение, но формула букв остаётся одной.">
          {AUDIT_MODES.map((item) => <OptionChoice key={item.value} active={audit.mode === item.value} disabled={status === "loading"} onClick={() => setAudit(emptyAudit(item.value))}>{item.label}</OptionChoice>)}
        </OptionScrollStrip>

        {showName && <><label className="soft-eyebrow product-question-label" htmlFor="surname-name-input">{audit.mode === "name" ? "ваше имя" : "имя, необязательно"}</label><input id="surname-name-input" value={audit.name} onChange={(event) => setField("name", event.target.value.slice(0, 80))} placeholder={namePlaceholder} className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} data-testid="surname-name-input" /></>}

        <label className="soft-eyebrow product-question-label" htmlFor="surname-input">{primaryLabel}</label>
        <input id="surname-input" value={audit.surname} onChange={(event) => setField("surname", event.target.value.slice(0, 80))} placeholder={surnamePlaceholder} className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} data-testid="surname-input" />

        {showComparison && <><label className="soft-eyebrow product-question-label" htmlFor="surname-comparison-input">{audit.mode === "change" ? "фамилия после смены" : "новый псевдоним или название"}</label><input id="surname-comparison-input" value={audit.comparison} onChange={(event) => setField("comparison", event.target.value.slice(0, 100))} placeholder={comparisonPlaceholder} className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} data-testid="surname-comparison-input" /></>}

        <OptionScrollStrip ariaLabel="Фокус кармического аудита" label={audit.mode === "alias" ? "какую цель должен поддержать образ" : "что раскрыть подробнее"}>
          {AUDIT_FOCUS[audit.mode].map((item) => <OptionChoice key={item} active={audit.focus === item} disabled={status === "loading"} onClick={() => setField("focus", item)}>{item}</OptionChoice>)}
        </OptionScrollStrip>

        <label className="soft-eyebrow product-question-label" htmlFor="surname-question-input">контекст или прямой вопрос, необязательно</label>
        <textarea id="surname-question-input" value={audit.context} onChange={(event) => setField("context", event.target.value.slice(0, 700))} placeholder={contextPlaceholder} className="soft-question-input product-question-input min-h-24" disabled={status === "loading"} />

        <SurnameTeaser surname={audit.surname} comparison={audit.comparison} mode={audit.mode} />

        <div className="product-action-row">
          {hasEntitlement ? <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="surname-start">{status === "loading" ? "Соединяем код с контекстом…" : "Открыть кармический аудит"}<ArrowRight className="size-4" aria-hidden="true" /></Button> : <ProductPurchaseControls productKey="surname-origin" label="Открыть кармический аудит" checkoutSource="surname-story-direct" creditCost={creditCost} onUnlocked={() => { setHasEntitlement(true); if (audit.surname.trim() && audit.focus) handleGenerate(); else setMessage("Доступ открыт. Заполните фамилию и выберите фокус аудита."); }} />}
        </div>
      </div>
    </div>
  );
}
