"use client";

import { useState } from "react";
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

function composeUserInput(name: string, surname: string, question: string): string {
  return [`Имя: ${name.trim()}`, `Фамилия: ${surname.trim()}`, question.trim() ? `Вопрос: ${question.trim()}` : ""].filter(Boolean).join("\n");
}

function parseInput(userInput?: string | null): { name: string; surname: string; question: string } {
  return {
    name: userInput?.match(/Имя:\s*(.+)/)?.[1]?.trim() ?? "",
    surname: userInput?.match(/Фамилия:\s*(.+)/)?.[1]?.trim() ?? userInput?.split("\n")[0]?.trim() ?? "",
    question: userInput?.match(/Вопрос:\s*(.+)/)?.[1]?.trim() ?? "",
  };
}

export function SurnameLineageVisual({ story, name }: { story: SurnameStory; name?: string }) {
  const displayName = [name?.trim(), story.surname].filter(Boolean).join(" ");
  const monogram = `${name?.trim()?.[0] ?? ""}${story.surname[0] ?? ""}`.toUpperCase();
  const evidenceLabel = story.evidence ? "есть словарные следы" : "версии требуют проверки";
  return (
    <figure data-testid="surname-identity-map" aria-label={`Карта имени ${displayName || story.surname}`}>
      <div className="overflow-hidden rounded-[22px] bg-[var(--soft-paper-card)] p-4 shadow-[0_24px_64px_rgba(91,64,45,0.10)] sm:p-6">
        <svg viewBox="0 0 520 320" role="img" aria-label={`Личное досье имени ${displayName || story.surname}`} className="block w-full">
          <defs>
            <radialGradient id="name-map-wash" cx="50%" cy="42%" r="68%">
              <stop offset="0" stopColor="#F3DDC5" stopOpacity="0.8" />
              <stop offset="1" stopColor="#FBF6EE" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="520" height="320" rx="24" fill="url(#name-map-wash)" />
          <ellipse cx="260" cy="160" rx="198" ry="112" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1" />
          <ellipse cx="260" cy="160" rx="152" ry="78" fill="none" stroke="var(--soft-terracotta-dark)" strokeOpacity="0.42" strokeWidth="1.2" strokeDasharray="4 7" />
          <path d="M92 160 C152 112 186 90 260 84 C334 90 368 112 428 160" fill="none" stroke="var(--soft-sage)" strokeOpacity="0.6" strokeWidth="1.4" />
          <path d="M92 160 C152 208 186 230 260 236 C334 230 368 208 428 160" fill="none" stroke="var(--soft-terracotta-dark)" strokeOpacity="0.55" strokeWidth="1.4" />
          <circle cx="260" cy="160" r="58" fill="var(--soft-paper)" stroke="var(--soft-paper-edge)" />
          <text x="260" y="148" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="42" fill="var(--soft-bordeaux)">{monogram || "ИФ"}</text>
          <text x="260" y="177" textAnchor="middle" fontSize="11" fill="var(--soft-ink-soft)">{displayName.slice(0, 34) || story.surname}</text>
          <text x="260" y="197" textAnchor="middle" fontSize="8.5" letterSpacing="1.5" fill="var(--soft-ink-faint)">ЛИЧНОЕ ДОСЬЕ</text>
          {[
            { x: 92, y: 160, title: "Форма", value: story.originLabel },
            { x: 260, y: 48, title: "Корень", value: story.rootHint ?? "рабочая версия" },
            { x: 428, y: 160, title: "География", value: story.regionHint ?? "нужен семейный регион" },
            { x: 260, y: 272, title: "Достоверность", value: evidenceLabel },
          ].map((node) => (
            <g key={node.title}>
              <circle cx={node.x} cy={node.y} r="31" fill="var(--soft-paper-deep)" stroke="var(--soft-paper-edge)" />
              <text x={node.x} y={node.y - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--soft-bordeaux)">{node.title}</text>
              <text x={node.x} y={node.y + 10} textAnchor="middle" fontSize="7.5" fill="var(--soft-ink-soft)">{node.value.length > 22 ? `${node.value.slice(0, 20)}…` : node.value}</text>
            </g>
          ))}
        </svg>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2" data-testid="surname-facts">
          <div className="rounded-[14px] bg-[var(--soft-paper-deep)] px-3 py-3"><p className="soft-eyebrow text-[0.6rem]">факт</p><p className="mt-1 text-sm text-[var(--soft-ink)]">форма и словообразование</p></div>
          <div className="rounded-[14px] bg-[var(--soft-paper-deep)] px-3 py-3"><p className="soft-eyebrow text-[0.6rem]">версия</p><p className="mt-1 text-sm text-[var(--soft-ink)]">происхождение и география</p></div>
          <div className="rounded-[14px] bg-[var(--soft-paper-deep)] px-3 py-3"><p className="soft-eyebrow text-[0.6rem]">зеркало</p><p className="mt-1 text-sm text-[var(--soft-ink)]">звучание и черты характера</p></div>
        </div>
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
  recap: { name: string; surname: string; question: string };
  onStartNew: () => void;
  creditCost: number;
}) {
  const story = extractSurnameStory(result);
  const recapRows = [
    recap.surname.trim() ? { label: "Фамилия", value: recap.surname.trim() } : null,
    recap.name.trim() ? { label: "Имя", value: recap.name.trim() } : null,
    recap.question.trim() ? { label: "Вопрос", value: recap.question.trim() } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <SymbolicResultScaffold
      productKey="surname-story"
      eyebrow="имя + фамилия"
      heading="Паспорт вашего имени"
      recapSummary={recap.surname.trim() ? `Фамилия: ${recap.surname.trim()}` : "Ваша фамилия"}
      recapRows={recapRows}
      visual={story ? <SurnameLineageVisual story={story} name={recap.name} /> : undefined}
      resultText={result.resultText ?? ""}
      topic={recap.question || null}
      creditCost={creditCost}
      repeat={{ ribbon: "разобрать ещё", title: "Разобрать другую фамилию", description: "Новое исследование происхождения и истории фамилии.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function SurnameStoryActions({ creditCost }: { creditCost: number }) {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [question, setQuestion] = useState("");

  const { hasEntitlement, setHasEntitlement, result, status, message, setMessage, generate, reset } =
    useSymbolicService("surname-story", (userInput) => {
      const parsed = parseInput(userInput);
      setName(parsed.name);
      setSurname(parsed.surname);
      setQuestion(parsed.question);
    });

  // #3: ввод переживает переход на /login.
  const { clear: clearDraft } = useInputDraft(
    "surname-story",
    { name, surname, question },
    (draft) => {
      if (typeof draft.surname === "string") setSurname(draft.surname);
      if (typeof draft.name === "string") setName(draft.name);
      if (typeof draft.question === "string") setQuestion(draft.question);
    },
    { active: !result },
  );

  function handleGenerate() {
    if (surname.trim().length < 2) {
      setMessage("Напишите свою фамилию — по её форме строится разбор.");
      return;
    }
    void generate(composeUserInput(name, surname, question));
  }

  function startNew() {
    reset();
    clearDraft();
    setSurname("");
    setName("");
    setQuestion("");
  }

  if (result?.resultText) {
    return (
      <SurnameStoryResultView
        result={result}
        recap={{ name, surname, question }}
        onStartNew={startNew}
        creditCost={creditCost}
      />
    );
  }

  return (
    <div className="soft-card product-order-surface" data-testid="surname-story-actions">
      <div className="product-order-head">
        <p className="soft-eyebrow">имя + фамилия · корни и звучание</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="product-controls">
        <label className="soft-eyebrow product-question-label" htmlFor="surname-name-input">ваше имя</label>
        <input id="surname-name-input" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Алексей" className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} data-testid="surname-name-input" />

        <label className="soft-eyebrow product-question-label" htmlFor="surname-input">ваша фамилия</label>
        <input
          id="surname-input"
          value={surname}
          onChange={(e) => setSurname(e.target.value.slice(0, 80))}
          placeholder="Кузнецов, Ковальчук, Соколова…"
          className="soft-question-input product-question-input product-line-input"
          disabled={status === "loading"}
          data-testid="surname-input"
        />

        <label className="soft-eyebrow product-question-label" htmlFor="surname-question-input">что хотите узнать, необязательно</label>
        <textarea id="surname-question-input" value={question} onChange={(e) => setQuestion(e.target.value.slice(0, 500))} placeholder="Например: какое впечатление создаёт сочетание имени и фамилии?" className="soft-question-input product-question-input min-h-20" disabled={status === "loading"} />

        <div className="mt-1">
          <SurnameTeaser />
        </div>

        <div className="product-action-row">
          {hasEntitlement ? (
            <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="surname-start">
              {status === "loading" ? "Собираем паспорт имени…" : "Открыть имя и фамилию"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="surname-story"
              label="Открыть имя и фамилию"
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
