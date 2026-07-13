"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { useSymbolicService, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import type { SurnameStory } from "@/lib/surname-story";
import { useRotatingPlaceholder } from "@/lib/use-rotating-placeholder";

const SURNAME_NAME_EXAMPLES = ["Анна", "Мария", "Елена"];
const SURNAME_EXAMPLES = ["Кузнецова", "Соколова", "Ковальчук"];
const SURNAME_QUESTION_EXAMPLES = [
  "Как звучание имени и фамилии влияет на первое впечатление?",
  "Какие версии происхождения стоит проверить в семейных документах?",
  "Какие варианты написания искать в архивах и за рубежом?",
];

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

function surnameParts(surname: string) {
  const lower = surname.toLocaleLowerCase("ru");
  const suffix = lower.match(/(швили|иани|ович|евич|цкая|ская|енко|чук|ёва|ева|ова|дзе|янц|ский|цкий|ина|ына|ю?к|ко|ых|их|ич|ёв|ев|ов|ян|ын|ин)$/u)?.[0] ?? "";
  return {
    stem: suffix ? surname.slice(0, Math.max(1, surname.length - suffix.length)) : surname,
    suffix: suffix ? surname.slice(surname.length - suffix.length) : "без явного форманта",
  };
}

function latinize(value: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return value.toLocaleLowerCase("ru").split("").map((letter) => map[letter] ?? letter).join("")
    .replace(/^./u, (letter) => letter.toUpperCase());
}

function nameRhythm(name: string | undefined, surname: string) {
  if (!name?.trim()) return "Добавьте имя, чтобы увидеть ритм полного сочетания";
  const fullName = `${name.trim()} ${surname}`;
  const vowelCount = (fullName.match(/[аеёиоуыэюяaeiouy]/giu) ?? []).length;
  return `${fullName.length - 1} букв · около ${Math.max(2, vowelCount)} слоговых ударов`;
}

export function SurnameLineageVisual({ story, name }: { story: SurnameStory; name?: string }) {
  const displayName = [name?.trim(), story.surname].filter(Boolean).join(" ");
  const monogram = `${name?.trim()?.[0] ?? ""}${story.surname[0] ?? ""}`.toUpperCase();
  const parts = surnameParts(story.surname);
  const evidenceLabel = story.evidence ? "словарный или документальный след" : "гипотеза по форме фамилии";
  const latin = latinize(story.surname);
  const traces = [
    { label: "Как устроено слово", value: `${parts.stem} · ${parts.suffix}`, status: "морфологический след", tone: "sage" },
    { label: "Ведущая версия", value: story.originLabel, status: story.evidence ? "есть источниковая подсказка" : "версия для проверки", tone: "terra" },
    { label: "Историческая среда", value: story.regionHint ?? "нужен ранний семейный регион", status: "не доказывает географию семьи", tone: "gold" },
    { label: "Звучание полного имени", value: nameRhythm(name, story.surname), status: "символическое восприятие", tone: "blue" },
    { label: "Вариант для поиска", value: latin, status: "латиница для архивов и документов", tone: "sage" },
  ];
  return (
    <figure data-testid="surname-identity-map" aria-label={`Атлас имени ${displayName || story.surname}`}>
      <div className="relative overflow-hidden rounded-[22px] bg-[var(--soft-paper-card)] p-4 shadow-[0_24px_64px_rgba(91,64,45,0.10)] sm:p-7">
        <svg viewBox="0 0 760 420" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-70">
          <defs><radialGradient id="surname-atlas-wash" cx="28%" cy="18%" r="82%"><stop offset="0" stopColor="#F2D3B5" stopOpacity=".72" /><stop offset=".55" stopColor="#E6E5C8" stopOpacity=".28" /><stop offset="1" stopColor="#FBF6EE" stopOpacity="0" /></radialGradient></defs>
          <rect width="760" height="420" fill="url(#surname-atlas-wash)" />
          <path d="M52 330 C160 242 228 294 318 190 S520 56 710 120" fill="none" stroke="#C98267" strokeOpacity=".24" strokeWidth="2" />
          <path d="M16 220 C160 152 250 212 378 124 S594 96 748 32" fill="none" stroke="#7E9A7A" strokeOpacity=".22" strokeWidth="1.4" strokeDasharray="5 9" />
          <circle cx="642" cy="332" r="76" fill="none" stroke="#AA8A54" strokeOpacity=".18" /><circle cx="642" cy="332" r="53" fill="none" stroke="#AA8A54" strokeOpacity=".18" />
        </svg>

        <div className="relative grid gap-5">
          <div className="flex flex-col items-center rounded-[20px] bg-[color-mix(in_srgb,var(--soft-paper)_86%,transparent)] px-5 py-6 text-center shadow-[0_14px_36px_rgba(91,64,45,0.08)]">
            <div className="grid size-24 place-items-center rounded-full border border-[var(--soft-terracotta)] bg-[var(--soft-paper-card)] font-heading text-4xl text-[var(--soft-bordeaux)] shadow-[inset_0_0_0_7px_var(--soft-paper-deep)]">{monogram || "ИФ"}</div>
            <p className="soft-eyebrow mt-4">атлас имени</p>
            <p className="mt-1 break-words font-heading text-2xl leading-tight text-[var(--soft-bordeaux)]">{displayName || story.surname}</p>
            <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--soft-paper-deep)] px-3 py-2 text-sm text-[var(--soft-ink)]">
              <span className="font-semibold">{parts.stem}</span><span className="text-[var(--soft-ink-faint)]">·</span><span>{parts.suffix}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--soft-ink-faint)]">основа · фамильный формант</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2" data-testid="surname-atlas-traces">
            {traces.map((trace, index) => (
              <div key={trace.label} className={`surname-atlas-trace surname-atlas-trace-${trace.tone} rounded-[17px] bg-[color-mix(in_srgb,var(--soft-paper-card)_90%,transparent)] p-4 shadow-[0_12px_32px_rgba(91,64,45,0.07)] ${index === traces.length - 1 ? "sm:col-span-2" : ""}`}>
                <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-current" aria-hidden="true" /><p className="soft-eyebrow text-[0.62rem]">{trace.label}</p></div>
                <p className="mt-2 break-words font-heading text-[1.08rem] leading-snug text-[var(--soft-ink)]">{trace.value}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--soft-ink-faint)]">{trace.status}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap gap-x-4 gap-y-2 rounded-[14px] bg-[color-mix(in_srgb,var(--soft-paper-deep)_80%,transparent)] px-4 py-3 text-[11px] text-[var(--soft-ink-soft)]" aria-label="Статусы сведений">
          <span><b className="text-[var(--soft-sage)]">●</b> след в форме</span><span><b className="text-[var(--soft-terracotta-dark)]">●</b> вероятная версия</span><span><b className="text-[#A27F3F]">●</b> требует семейной проверки</span><span><b className="text-[#607F9B]">●</b> символическое чтение</span>
        </div>

        <div className="relative mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5" data-testid="surname-facts">
          {[
            ["Что видно в написании", `Основа «${parts.stem}» и формант «${parts.suffix}»`],
            ["Главный след", `${story.originLabel} · ${evidenceLabel}`],
            ["Как звучит полное имя", nameRhythm(name, story.surname)],
            ["С чего начать проверку", story.evidence?.historicalMentions?.[0] ?? `Найти самый ранний семейный регион и варианты «${latin}»`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[14px] bg-[var(--soft-paper-deep)] px-3 py-3"><p className="soft-eyebrow text-[0.6rem]">{label}</p><p className="mt-1 break-words text-sm leading-relaxed text-[var(--soft-ink)]">{value}</p></div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function SurnameTeaser({ name, surname }: { name: string; surname: string }) {
  const enteredSurname = surname.trim();
  const parts = surnameParts(enteredSurname || "Фамилия");
  const monogram = `${name.trim()[0] ?? ""}${enteredSurname[0] ?? ""}`.toUpperCase() || "ИФ";
  return (
    <div
      className="relative overflow-hidden rounded-[18px] bg-[var(--soft-paper-card)] p-4 shadow-[0_14px_36px_rgba(91,64,45,0.07)]"
      data-testid="surname-teaser"
    >
      <svg viewBox="0 0 520 150" className="pointer-events-none absolute inset-0 h-full w-full opacity-50" aria-hidden="true"><path d="M12 118 C110 42 176 116 260 45 S412 72 508 18" fill="none" stroke="#C98267" strokeOpacity=".35" strokeWidth="2" /><circle cx="448" cy="118" r="48" fill="none" stroke="#7E9A7A" strokeOpacity=".32" /></svg>
      <div className="relative flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] font-heading text-2xl text-[var(--soft-bordeaux)]">{monogram}</div>
        <div className="min-w-0 text-left">
          <p className="soft-eyebrow">персональный атлас имени</p>
          {enteredSurname ? <><p className="mt-1 break-words font-heading text-lg text-[var(--soft-ink)]">{parts.stem} · {parts.suffix}</p><p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">В полном атласе: версии происхождения, звучание, латиница и маршрут проверки.</p></> : <p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">Введите одну фамилию: атлас соберёт её по пяти слоям.</p>}
        </div>
      </div>
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
      heading="Атлас имени и фамилии"
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
  const namePlaceholder = useRotatingPlaceholder(SURNAME_NAME_EXAMPLES, "surname-name");
  const surnamePlaceholder = useRotatingPlaceholder(SURNAME_EXAMPLES, "surname");
  const questionPlaceholder = useRotatingPlaceholder(SURNAME_QUESTION_EXAMPLES, "surname-question");

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
        <input id="surname-name-input" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder={namePlaceholder} className="soft-question-input product-question-input product-line-input" disabled={status === "loading"} data-testid="surname-name-input" />

        <label className="soft-eyebrow product-question-label" htmlFor="surname-input">ваша фамилия</label>
        <input
          id="surname-input"
          value={surname}
          onChange={(e) => setSurname(e.target.value.slice(0, 80))}
          placeholder={surnamePlaceholder}
          className="soft-question-input product-question-input product-line-input"
          disabled={status === "loading"}
          data-testid="surname-input"
        />

        <label className="soft-eyebrow product-question-label" htmlFor="surname-question-input">что хотите узнать, необязательно</label>
        <textarea id="surname-question-input" value={question} onChange={(e) => setQuestion(e.target.value.slice(0, 500))} placeholder={questionPlaceholder} className="soft-question-input product-question-input min-h-20" disabled={status === "loading"} />

        <div className="mt-1">
          <SurnameTeaser name={name} surname={surname} />
        </div>

        <div className="product-action-row">
          {hasEntitlement ? (
            <Button onClick={handleGenerate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="surname-start">
              {status === "loading" ? "Собираем атлас имени…" : "Открыть имя и фамилию"}
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
