"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import type { SurnameStory } from "@/lib/surname-story";

// B451: «История фамилии» — самодостаточная услуга по паттерну Таро/reframe.
// Форма/происхождение фамилии распознаются детерминированно (server), разбор опирается
// на них; нет бесплатного фрагмента; автосейв; сессии по ?reading=.

export type SurnameResult = SymbolicResult;

const EXAMPLES_DEFAULT = [
  "Например: откуда могла прийти моя фамилия и что она говорит о роде?",
  "Опишите, что хотите проверить: происхождение, географию, занятие предков или семейную легенду.",
];

export function extractSurnameStory(result: SymbolicResult | null): SurnameStory | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.surname ?? meta.surname) as unknown;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { surname?: unknown; originKind?: unknown };
  if (typeof candidate.surname !== "string" || typeof candidate.originKind !== "string") return null;
  return raw as SurnameStory;
}

function composeUserInput(surname: string, question: string, topic: string | null): string {
  return [
    surname.trim(),
    question.trim() ? `Вопрос: ${question.trim()}` : "",
    topic ? `Сфера: ${topic}` : "",
  ].filter(Boolean).join("\n");
}

function parseInput(userInput?: string | null): { surname: string; question: string; topic: string | null } {
  if (!userInput) return { surname: "", question: "", topic: null };
  return {
    surname: userInput.split("\n")[0]?.trim() ?? "",
    question: userInput.match(/Вопрос:\s*(.+)/)?.[1]?.trim() ?? "",
    topic: userInput.match(/Сфера:\s*(.+)/)?.[1]?.trim() ?? null,
  };
}

function SurnameLineageVisual({ story }: { story: SurnameStory }) {
  const nodes: Array<{ x: number; y: number; label: string; value: string }> = [
    { x: 70, y: 146, label: "форма", value: story.originLabel },
    { x: 160, y: 68, label: "фамилия", value: story.surname },
    { x: 250, y: 146, label: "тема", value: story.rootHint ?? story.regionHint ?? "родовая версия" },
    { x: 160, y: 206, label: "проверка", value: "метрики · архивы · память" },
  ];

  return (
    <figure data-testid="surname-lineage">
      <svg viewBox="0 0 320 245" role="img" aria-label={`Карта происхождения фамилии ${story.surname}`} className="mx-auto block w-full max-w-[340px]">
        <rect x="20" y="18" width="280" height="206" rx="18" fill="var(--soft-paper-card)" stroke="var(--soft-paper-edge)" />
        <path d="M160 68 C128 94, 98 110, 70 146" fill="none" stroke="var(--soft-terracotta-dark)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M160 68 C192 94, 222 110, 250 146" fill="none" stroke="var(--soft-sage)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M160 68 L160 206" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1.4" strokeDasharray="5 5" />
        <path d="M70 146 C98 190, 128 206, 160 206 C192 206, 222 190, 250 146" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1.2" strokeDasharray="4 5" />
        {nodes.map((node) => (
          <g key={node.label}>
            <circle cx={node.x} cy={node.y} r={node.label === "фамилия" ? 31 : 27} fill="var(--soft-paper-deep)" stroke="var(--soft-terracotta-dark)" strokeWidth="1.5" />
            <text x={node.x} y={node.y - 4} textAnchor="middle" fontSize="8" fill="var(--soft-muted)" className="soft-eyebrow">{node.label}</text>
            <text x={node.x} y={node.y + 9} textAnchor="middle" fontSize={node.label === "фамилия" ? "12" : "8.5"} fontWeight="600" fill="var(--soft-bordeaux)">
              {node.value.length > 18 ? `${node.value.slice(0, 16)}…` : node.value}
            </text>
          </g>
        ))}
        <text x="34" y="38" fontSize="9" fill="var(--soft-muted)">версии происхождения</text>
        <text x="286" y="216" textAnchor="end" fontSize="9" fill="var(--soft-muted)">следы для проверки</text>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-[var(--soft-ink-faint)]">
        {story.surname} · {story.originLabel.toLowerCase()} · форма, версия, география и проверка
      </figcaption>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="surname-facts">
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">происхождение</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{story.originLabel}</p>
        </div>
        {story.rootHint && (
          <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
            <p className="soft-eyebrow text-[0.6rem]">связана с</p>
            <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{story.rootHint}</p>
          </div>
        )}
        {story.regionHint && (
          <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
            <p className="soft-eyebrow text-[0.6rem]">география формы</p>
            <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{story.regionHint}</p>
          </div>
        )}
      </div>
    </figure>
  );
}

function SurnameTeaser() {
  return (
    <div
      className="rounded-[16px] border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-center"
      data-testid="surname-teaser"
      aria-hidden="true"
    >
      <svg viewBox="0 0 320 150" className="mx-auto block w-full max-w-[260px]">
        <path d="M54 120 C98 64, 137 62, 160 34 C185 63, 224 64, 266 120" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
        {([[54, 120], [160, 34], [266, 120]] as Array<[number, number]>).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="20" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1.4" strokeDasharray="3 4" />
        ))}
        <text x="160" y="38" textAnchor="middle" dominantBaseline="central" fontSize="20" fill="var(--soft-ink-faint)">?</text>
      </svg>
      <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">история рода появится здесь после оплаты</p>
    </div>
  );
}

export function SurnameStoryResultView({
  result,
  recap,
  onStartNew,
  creditCost,
}: {
  result: SymbolicResult;
  recap: { surname: string; question: string; topic: string | null };
  onStartNew: () => void;
  creditCost: number;
}) {
  const story = extractSurnameStory(result);
  const recapRows = [
    recap.surname.trim() ? { label: "Фамилия", value: recap.surname.trim() } : null,
    recap.question.trim() ? { label: "Вопрос", value: recap.question.trim() } : null,
    recap.topic ? { label: "Сфера", value: recap.topic } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <SymbolicResultScaffold
      productKey="surname-story"
      eyebrow="история фамилии"
      heading="История вашей фамилии"
      recapSummary={recap.surname.trim() ? `Фамилия: ${recap.surname.trim()}` : "Ваша фамилия и вопрос"}
      recapRows={recapRows}
      visual={story ? <SurnameLineageVisual story={story} /> : undefined}
      resultText={result.resultText ?? ""}
      topic={recap.topic}
      creditCost={creditCost}
      repeat={{ ribbon: "разобрать ещё", title: "Разобрать другую фамилию", description: "Свежий родовой разбор по новой фамилии или вопросу.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function SurnameStoryActions({ creditCost }: { creditCost: number }) {
  const [surname, setSurname] = useState("");
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } =
    useSymbolicService("surname-story", (userInput) => {
      const parsed = parseInput(userInput);
      setSurname(parsed.surname);
      setQuestion(parsed.question);
      setTopic(parsed.topic);
    });

  // #3: ввод переживает переход на /login.
  const { clear: clearDraft } = useInputDraft(
    "surname-story",
    { surname, question, topic },
    (draft) => {
      if (typeof draft.surname === "string") setSurname(draft.surname);
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
    if (surname.trim().length < 2) {
      setMessage("Напишите свою фамилию — по её форме строится разбор.");
      return;
    }
    void generate(composeUserInput(surname, question, topic));
  }

  function startNew() {
    reset();
    clearDraft();
    setSurname("");
    setQuestion("");
    setTopic(null);
  }

  if (result?.resultText) {
    return (
      <SurnameStoryResultView
        result={result}
        recap={{ surname, question, topic }}
        onStartNew={startNew}
        creditCost={creditCost}
      />
    );
  }

  const placeholder = EXAMPLES_DEFAULT[exampleIdx % EXAMPLES_DEFAULT.length];

  return (
    <div className="soft-card tarot-order-surface" data-testid="surname-story-actions">
      <div className="tarot-head">
        <p className="soft-eyebrow">род · история фамилии</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="tarot-controls">
        <label className="soft-eyebrow tarot-question-label" htmlFor="surname-input">ваша фамилия</label>
        <input
          id="surname-input"
          value={surname}
          onChange={(e) => setSurname(e.target.value.slice(0, 80))}
          placeholder="Кузнецов, Ковальчук, Соколова…"
          className="soft-question-input tarot-question-input tarot-line-input"
          disabled={status === "loading"}
          data-testid="surname-input"
        />

        <label className="soft-eyebrow tarot-question-label" htmlFor="surname-question-input">ваш вопрос (необязательно)</label>
        <textarea
          id="surname-question-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 2000))}
          placeholder={placeholder}
          rows={2}
          className="soft-question-input tarot-question-input"
          disabled={status === "loading"}
          data-testid="surname-question-input"
        />

        <div className="mt-1">
          <SurnameTeaser />
        </div>

        <div className="tarot-action-row">
          {hasEntitlement ? (
            <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="surname-start">
              {status === "loading" ? "Читаем фамилию…" : "Открыть историю фамилии"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="surname-story"
              label="Открыть историю фамилии"
              checkoutSource="surname-story-direct"
              creditCost={creditCost}
              onUnlocked={() => {
                setHasEntitlement(true);
                if (surname.trim()) {
                  handleGenerate();
                } else {
                  setMessage("Доступ открыт. Напишите фамилию — и разбор появится здесь же.");
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
