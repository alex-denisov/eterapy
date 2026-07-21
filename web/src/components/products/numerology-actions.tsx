"use client";

import { type CSSProperties, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionScrollStrip, OptionChoice } from "@/components/products/option-scroll-strip";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import type { NumerologyPortrait } from "@/lib/numerology";
import type { DestinyMatrix } from "@/lib/destiny-matrix";
import { useRotatingPlaceholder } from "@/lib/use-rotating-placeholder";

// B451: «Числовой портрет» — самодостаточная услуга по паттерну Таро/reframe.
// Ядровые числа (путь/выражение/душа) считаются детерминированно (lib/numerology),
// разбор опирается на них; нет бесплатного фрагмента; автосейв; сессии по ?reading=.

export type NumerologyResult = SymbolicResult;

const TOPICS = ["самопознание", "работа", "отношения", "любовь", "семья", "деньги", "перемены", "предназначение"];
const NUMEROLOGY_NAME_EXAMPLES = ["Анна Петрова", "Мария Соколова", "Елена Ковальчук"];
const NUMEROLOGY_BIRTH_EXAMPLES = ["12.04.1992", "03.11.1988", "27.06.1995"];

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

function MatrixNode({ x, y, value, tone = "neutral", size = 15 }: { x: number; y: number; value: number; tone?: "neutral" | "violet" | "gold" | "red"; size?: number }) {
  const fill = tone === "violet" ? "#8052A6" : tone === "gold" ? "#D6B65D" : tone === "red" ? "#B84B48" : "#FFFDF8";
  const color = tone === "neutral" ? "#3A332E" : "#FFFDF8";
  return <g><circle cx={x} cy={y} r={size} fill={fill} stroke={tone === "neutral" ? "#CDBDAA" : fill} strokeWidth="2" /><text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.9} fontWeight="700" fill={color}>{value}</text></g>;
}

export function DestinyMatrixChart({ matrix }: { matrix: DestinyMatrix }) {
  return (
    <figure data-testid="numerology-chart" aria-label={`Матрица судьбы: центральная энергия ${matrix.center}`}>
      <div className="rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3 sm:p-5">
        <svg viewBox="0 0 420 420" className="mx-auto block w-full max-w-[520px]" role="img" aria-label="Матрица судьбы 22 энергий">
          <circle cx="210" cy="210" r="174" fill="none" stroke="#D8C9B8" strokeWidth="1" />
          <path d="M 36 210 L 210 36 L 384 210 L 210 384 Z" fill="none" stroke="#3E3A36" strokeWidth="1.5" />
          <path d="M 87 87 L 333 87 L 333 333 L 87 333 Z" fill="none" stroke="#6F665D" strokeWidth="1.2" />
          <path d="M 36 210 L 384 210 M 210 36 L 210 384" fill="none" stroke="#8D8278" strokeWidth="1" />
          <path d="M 87 87 L 333 333" fill="none" stroke="#4E7FA0" strokeWidth="1.5" />
          <path d="M 333 87 L 87 333" fill="none" stroke="#B86A72" strokeWidth="1.5" />
          <path d="M 210 296 L 267 267 L 296 210" fill="none" stroke="#B5963F" strokeWidth="2" strokeLinecap="round" />
          <path d="M 267 267 L 247 286" fill="none" stroke="#B84B48" strokeWidth="2" strokeLinecap="round" />
          <path d="M 267 267 L 286 247" fill="none" stroke="#B5963F" strokeWidth="2" strokeLinecap="round" />
          <text x="236" y="310" fontSize="10" fill="#A92F43">отношения</text>
          <text x="294" y="238" fontSize="10" fill="#8E7734">деньги</text>
          {matrix.perimeterCycle.map((item) => {
            const angle = Math.PI + (item.age / 80) * Math.PI * 2;
            const x = 210 + 196 * Math.cos(angle);
            const y = 210 + 196 * Math.sin(angle);
            const energy = item.major ? 188 : 181;
            const energyX = 210 + energy * Math.cos(angle);
            const energyY = 210 + energy * Math.sin(angle);
            return <g key={`${item.age}-${item.label}`}><circle cx={x} cy={y} r={item.major ? 2.4 : 1.4} fill="#6F665D" /><text x={energyX} y={energyY} textAnchor="middle" dominantBaseline="central" fontSize={item.major ? 8.5 : 5.5} fill="#74695F">{item.energy}</text>{item.major && <text x={x} y={y - 10} textAnchor="middle" fontSize="7" fill="#74695F">{item.label}</text>}</g>;
          })}
          <MatrixNode x={36} y={210} value={matrix.west.outer} tone="violet" size={22} />
          <MatrixNode x={210} y={36} value={matrix.north.outer} tone="violet" size={22} />
          <MatrixNode x={384} y={210} value={matrix.east.outer} tone="red" size={22} />
          <MatrixNode x={210} y={384} value={matrix.south.outer} tone="red" size={22} />
          <MatrixNode x={87} y={87} value={matrix.northwest.outer} size={18} />
          <MatrixNode x={333} y={87} value={matrix.northeast.outer} size={18} />
          <MatrixNode x={333} y={333} value={matrix.southeast.outer} size={18} />
          <MatrixNode x={87} y={333} value={matrix.southwest.outer} size={18} />
          <MatrixNode x={210} y={210} value={matrix.center} tone="gold" size={25} />
          <MatrixNode x={87} y={210} value={matrix.west.outerInner} size={13} />
          <MatrixNode x={124} y={210} value={matrix.west.middle} tone="violet" size={13} />
          <MatrixNode x={165} y={210} value={matrix.west.inner} size={11} />
          <MatrixNode x={210} y={87} value={matrix.north.outerInner} size={13} />
          <MatrixNode x={210} y={124} value={matrix.north.middle} tone="violet" size={13} />
          <MatrixNode x={210} y={165} value={matrix.north.inner} size={11} />
          <MatrixNode x={333} y={210} value={matrix.east.outerInner} size={13} />
          <MatrixNode x={296} y={210} value={matrix.east.middle} tone="red" size={13} />
          <MatrixNode x={255} y={210} value={matrix.east.inner} size={11} />
          <MatrixNode x={210} y={333} value={matrix.south.outerInner} size={13} />
          <MatrixNode x={210} y={296} value={matrix.south.middle} tone="red" size={13} />
          <MatrixNode x={210} y={255} value={matrix.south.inner} size={11} />
          <MatrixNode x={112} y={112} value={matrix.northwest.outerInner} size={10} />
          <MatrixNode x={142} y={142} value={matrix.northwest.middle} size={10} />
          <MatrixNode x={308} y={112} value={matrix.northeast.outerInner} size={10} />
          <MatrixNode x={278} y={142} value={matrix.northeast.middle} size={10} />
          <MatrixNode x={308} y={308} value={matrix.southeast.outerInner} size={10} />
          <MatrixNode x={278} y={278} value={matrix.southeast.middle} size={10} />
          <MatrixNode x={112} y={308} value={matrix.southwest.outerInner} size={10} />
          <MatrixNode x={142} y={278} value={matrix.southwest.middle} size={10} />
          <MatrixNode x={267} y={267} value={matrix.love.core} tone="gold" size={10} />
          <MatrixNode x={247} y={286} value={matrix.love.outcome} tone="red" size={9} />
          <MatrixNode x={286} y={247} value={matrix.money.outcome} tone="gold" size={9} />
        </svg>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Позиции расшифровки">
          {matrix.zones.map((zone) => (
            <div key={zone.key} className="rounded-[14px] bg-[var(--soft-paper-deep)] px-3 py-2.5">
              <p className="text-[11px] font-medium leading-tight text-[var(--soft-ink)]">{zone.title}</p>
              <p className="mt-1 text-[10px] leading-tight text-[var(--soft-ink-faint)]">{zone.hint}</p>
              <p className="mt-2 font-heading text-xl text-[var(--soft-bordeaux)]">{zone.value}</p>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function DestinyPurposes({ matrix }: { matrix: DestinyMatrix }) {
  const routes = [
    { title: "Поиск себя", left: `Земля ${matrix.purposes.personalEarth}`, right: `Небо ${matrix.purposes.personalHeaven}`, result: matrix.purposes.personal },
    { title: "Социализация", left: `Мать ${matrix.purposes.maternal}`, right: `Отец ${matrix.purposes.paternal}`, result: matrix.purposes.ancestral },
    { title: "Духовная гармония", left: `Личное ${matrix.purposes.personal}`, right: `Родовое ${matrix.purposes.ancestral}`, result: matrix.purposes.spiritual },
    { title: "Планетарное", left: `Духовное ${matrix.purposes.spiritual}`, right: `Родовое ${matrix.purposes.ancestral}`, result: matrix.purposes.highest },
  ];
  return (
    <section className="rounded-[18px] bg-[var(--soft-paper-card)] p-5 shadow-[0_18px_48px_rgba(91,64,45,0.08)]" aria-label="Карта предназначений">
      <p className="font-heading text-xl text-[var(--soft-bordeaux)]">Карта предназначений</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">Четыре маршрута показаны формулами, длинные подписи больше не зажаты внутри кругов.</p>
      <div className="mt-5 divide-y divide-[var(--soft-paper-edge)]">
        {routes.map((route) => (
          <div key={route.title} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <p className="font-medium text-[var(--soft-ink)]">{route.title}</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{route.left} + {route.right}</p>
            </div>
            <div className="flex items-center gap-2 font-heading text-[var(--soft-bordeaux)]">
              <span className="text-sm text-[var(--soft-ink-faint)]">итог</span>
              <strong className="min-w-11 rounded-full bg-[var(--soft-paper-deep)] px-3 py-2 text-center text-lg">{route.result}</strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const CHAKRA_COLORS = ["#8052A6", "#5867B5", "#3B85B3", "#6B9865", "#B6983D", "#C17A43", "#B84B48"];

function NumerologyChart({ portrait }: { portrait: NumerologyPortrait }) {
  if (!portrait.matrix) return null;
  return (
    <div className="space-y-8">
      <DestinyMatrixChart matrix={portrait.matrix} />
      <DestinyPurposes matrix={portrait.matrix} />
      <section className="overflow-hidden rounded-[18px] bg-[var(--soft-paper-card)] shadow-[0_18px_48px_rgba(91,64,45,0.08)]" aria-label="Карта здоровья">
        <div className="p-4"><p className="font-heading text-lg text-[var(--soft-bordeaux)]">Карта здоровья</p><p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">Эзотерическая карта энергий, не медицинская диагностика.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead><tr className="bg-[var(--soft-paper-deep)]"><th className="p-3">Позиция</th><th className="p-3">Небо</th><th className="p-3">Земля</th><th className="p-3">Ключ</th><th className="p-3">Смысл позиции</th></tr></thead>
            <tbody>{portrait.matrix.health.map((row, index) => <tr key={row.key} className="border-t border-[var(--soft-paper-edge)]" style={{ "--chakra-color": CHAKRA_COLORS[index] } as CSSProperties}><th className="p-3 font-medium"><span className="mr-2 inline-block size-2.5 rounded-full bg-[var(--chakra-color)]" />{row.name}</th><td className="p-3 font-semibold text-[var(--chakra-color)]">{row.energy}</td><td className="p-3 font-semibold text-[var(--chakra-color)]">{row.physical}</td><td className="p-3 font-semibold text-[var(--chakra-color)]">{row.emotions}</td><td className="p-3 text-[var(--soft-ink-soft)]">{row.focus}</td></tr>)}</tbody>
            <tfoot><tr className="border-t border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] font-semibold"><th className="p-3">Организм, итог</th><td className="p-3">{portrait.matrix.healthTotal.energy}</td><td className="p-3">{portrait.matrix.healthTotal.physical}</td><td className="p-3">{portrait.matrix.healthTotal.emotions}</td><td className="p-3">общий энергетический рисунок</td></tr></tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function NumerologyTeaser() {
  return (
    <div
      className="rounded-[16px] border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-center"
      data-testid="numerology-teaser"
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 160" className="mx-auto block w-32" aria-hidden="true"><circle cx="80" cy="80" r="64" fill="none" stroke="var(--soft-paper-edge)" strokeDasharray="3 5" /><path d="M 16 80 L 80 16 L 144 80 L 80 144 Z M 35 35 L 125 35 L 125 125 L 35 125 Z" fill="none" stroke="var(--soft-paper-edge)" /><circle cx="80" cy="80" r="13" fill="var(--soft-paper-deep)" /></svg>
      <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">матрица 22 энергий появится здесь после оплаты</p>
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
      resultId={result.id}
      productKey="numerology"
      eyebrow="матрица судьбы · 22 энергии"
      heading="Ваша Матрица судьбы"
      recapSummary="Имя и дата рождения"
      recapRows={recapRows}
      visual={portrait ? <NumerologyChart portrait={portrait} /> : undefined}
      resultText={result.resultText ?? ""}
      topic={recap.topic}
      creditCost={creditCost}
      repeat={{ ribbon: "посчитать ещё", title: "Построить новую матрицу", description: "Новый расчёт 22 энергий по другой дате рождения.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function NumerologyActions({ creditCost }: { creditCost: number }) {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [fieldWarnings, setFieldWarnings] = useState<{ name: boolean; birth: boolean }>({ name: false, birth: false });
  const namePlaceholder = useRotatingPlaceholder(NUMEROLOGY_NAME_EXAMPLES, topic ?? "all");
  const birthPlaceholder = useRotatingPlaceholder(NUMEROLOGY_BIRTH_EXAMPLES, topic ?? "all");

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

  // B554 п.25: обязательные поля проверяются ДО оплаты, а не после списания.
  // Предупреждение подсвечивает конкретное поле и гаснет, как только человек
  // начинает в него писать.
  function missingInput(): string | null {
    const noName = name.trim().length < 2;
    const noBirth = birth.trim().length < 4;
    setFieldWarnings({ name: noName, birth: noBirth });
    if (!noName && !noBirth) return null;
    if (noName && noBirth) return "Укажите имя и дату рождения — по ним считаются ваши числа.";
    return noName ? "Укажите полное имя — по нему считаются ваши числа." : "Укажите дату рождения — по ней считаются ваши числа.";
  }

  function handleGenerate() {
    const warning = missingInput();
    if (warning) {
      setMessage(warning);
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
        <p className="soft-eyebrow">матрица судьбы · метод 22 энергий</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="product-controls">
        <OptionScrollStrip ariaLabel="Фокус Матрицы судьбы" label="что разобрать глубже" hint="Выберите сферу, в которой особенно важно прочитать сочетание энергий матрицы.">
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
          onChange={(e) => { setName(e.target.value.slice(0, 120)); if (fieldWarnings.name) setFieldWarnings((current) => ({ ...current, name: false })); }}
          placeholder={namePlaceholder}
          className="soft-question-input product-question-input product-line-input"
          disabled={status === "loading"}
          aria-invalid={fieldWarnings.name || undefined}
          data-field-warning={fieldWarnings.name ? "1" : undefined}
          data-testid="numerology-name-input"
        />

        <label className="soft-eyebrow product-question-label" htmlFor="numerology-birth-input">дата рождения</label>
        <input
          id="numerology-birth-input"
          value={birth}
          onChange={(e) => { setBirth(e.target.value.slice(0, 60)); if (fieldWarnings.birth) setFieldWarnings((current) => ({ ...current, birth: false })); }}
          placeholder={birthPlaceholder}
          className="soft-question-input product-question-input product-line-input"
          disabled={status === "loading"}
          aria-invalid={fieldWarnings.birth || undefined}
          data-field-warning={fieldWarnings.birth ? "1" : undefined}
          data-testid="numerology-birth-input"
        />

        <div className="mt-1">
          <NumerologyTeaser />
        </div>

        <div className="product-action-row">
          {hasEntitlement ? (
            <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="numerology-start">
              {status === "loading" ? "Строим матрицу…" : "Открыть Матрицу судьбы"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="numerology"
              label="Открыть Матрицу судьбы"
              checkoutSource="numerology-direct"
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
