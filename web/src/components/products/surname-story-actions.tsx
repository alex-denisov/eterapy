"use client";

import { useId, useRef, useState } from "react";
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
  return `${fullName.replace(/[^\p{L}]/gu, "").length} букв · ${vowelCount} гласных`;
}

const SURNAME_ARCHETYPE: Record<SurnameStory["originKind"], string> = {
  patronymic: "Преемник",
  locative: "Хранитель места",
  occupational: "Мастер",
  "west-slavic": "Продолжатель",
  caucasian: "Хранитель рода",
  northern: "Самостоятельный",
  descriptive: "Носитель образа",
  unknown: "Исследователь",
};

type RoseLayer = {
  id: string;
  label: string;
  value: string;
  detail: string;
  status: string;
  tone: "observed" | "sourced" | "hypothesis" | "symbolic" | "research";
  action: string;
};

export function SurnameLineageVisual({ story, name }: { story: SurnameStory; name?: string }) {
  const visualId = useId().replace(/:/g, "");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const displayName = [name?.trim(), story.surname].filter(Boolean).join(" ");
  const monogram = `${name?.trim()?.[0] ?? ""}${story.surname[0] ?? ""}`.toUpperCase();
  const parts = surnameParts(story.surname);
  const latin = latinize(story.surname);
  const archiveLead = story.evidence?.historicalMentions?.[0] ?? `Ищите варианты «${story.surname}» и «${latin}» в метрических книгах и переписях`;
  const layers: RoseLayer[] = [
    {
      id: "structure",
      label: "Строение",
      value: `${parts.stem} · ${parts.suffix}`,
      detail: `Что видно в написании: основа «${parts.stem}» и формант «${parts.suffix}». Это наблюдаемая форма слова — самый надёжный первый слой разбора.`,
      status: "видно в написании",
      tone: "observed",
      action: `Сравните семейные варианты написания основы «${parts.stem}».`,
    },
    {
      id: "origin",
      label: "Происхождение",
      value: story.originLabel,
      detail: story.originStory,
      status: story.evidence ? "есть источниковый след" : "версия по форме",
      tone: story.evidence ? "sourced" : "hypothesis",
      action: story.evidence?.sourceNotes?.[0] ?? "Проверьте версию по ономастическим словарям и ранним документам семьи.",
    },
    {
      id: "geography",
      label: "География",
      value: story.regionHint ?? "регион ещё не установлен",
      detail: story.evidence?.geography?.length
        ? `В справочных следах встречаются: ${story.evidence.geography.join(", ")}. Это направление поиска, а не доказательство происхождения конкретной семьи.`
        : "Форма фамилии даёт лишь широкую историческую среду. Реальная география вашей линии начинается с самого раннего подтверждённого места жизни предков.",
      status: story.evidence ? "справочный след" : "нужна семейная проверка",
      tone: story.evidence ? "sourced" : "research",
      action: "Запишите населённый пункт самого старшего известного носителя фамилии.",
    },
    {
      id: "sound",
      label: "Звучание",
      value: nameRhythm(name, story.surname),
      detail: name?.trim()
        ? `Сочетание «${displayName}» рассматривается через длину, чередование согласных и гласных и ритм произнесения. Это фоносемантическое впечатление, а не измерение интеллекта или личности.`
        : "Добавьте имя, чтобы увидеть ритм полного сочетания, плотность согласных и варианты звучания в повседневном обращении.",
      status: "символическое чтение",
      tone: "symbolic",
      action: `Произнесите «${displayName || story.surname}» медленно и в обычном темпе: отметьте, где голос естественно делает акцент.`,
    },
    {
      id: "character",
      label: "Образ характера",
      value: SURNAME_ARCHETYPE[story.originKind],
      detail: `Символический архетип «${SURNAME_ARCHETYPE[story.originKind]}» выведен из типа формы фамилии. Он может отражать социальное впечатление — ${story.familyTheme} — но не определяет ваши реальные черты и не заменяет наблюдение за собой.`,
      status: "образ для самопроверки",
      tone: "symbolic",
      action: "Отметьте, где этот образ помогает вам, а где создаёт чужие ожидания.",
    },
    {
      id: "archive",
      label: "Архивный след",
      value: latin,
      detail: archiveLead,
      status: story.evidence ? "есть документальная подсказка" : "маршрут исследования",
      tone: story.evidence ? "sourced" : "research",
      action: `С чего начать проверку: найдите самый ранний семейный регион и ищите «${latin}» вместе с кириллическими вариантами.`,
    },
  ];
  const positions = [
    { left: 50, top: 8 },
    { left: 82, top: 29 },
    { left: 82, top: 70 },
    { left: 50, top: 91 },
    { left: 18, top: 70 },
    { left: 18, top: 29 },
  ];
  const letters = story.surname.toLocaleUpperCase("ru").replace(/[^\p{L}]/gu, "").split("");
  const selectedLayer = layers[selectedIndex];

  function selectFromKeyboard(index: number, key: string) {
    let next = index;
    if (key === "ArrowRight" || key === "ArrowDown") next = (index + 1) % layers.length;
    else if (key === "ArrowLeft" || key === "ArrowUp") next = (index - 1 + layers.length) % layers.length;
    else if (key === "Home") next = 0;
    else if (key === "End") next = layers.length - 1;
    else return;
    setSelectedIndex(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <figure className="surname-rose" data-testid="surname-identity-map" aria-label={`Фамильная роза ${displayName || story.surname}`}>
      <div className="surname-rose-stage">
        <div className="surname-rose-canvas">
          <svg viewBox="0 0 720 640" aria-hidden="true" className="surname-rose-svg">
            <defs>
              <radialGradient id={`${visualId}-wash`} cx="50%" cy="46%" r="58%">
                <stop offset="0" stopColor="var(--soft-paper-card)" />
                <stop offset=".56" stopColor="var(--soft-paper-deep)" stopOpacity=".82" />
                <stop offset="1" stopColor="var(--soft-paper-deep)" stopOpacity="0" />
              </radialGradient>
              <filter id={`${visualId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" />
              </filter>
            </defs>
            <circle cx="360" cy="320" r="270" fill={`url(#${visualId}-wash)`} />
            <circle cx="360" cy="320" r="238" className="surname-rose-orbit surname-rose-orbit-outer" />
            <circle cx="360" cy="320" r="190" className="surname-rose-orbit" strokeDasharray="2 12" />
            <circle cx="360" cy="320" r="142" className="surname-rose-orbit" />
            {positions.map((position, index) => {
              const angle = (-90 + index * 60) * Math.PI / 180;
              const x = 360 + Math.cos(angle) * 238;
              const y = 320 + Math.sin(angle) * 238;
              return <path key={layers[index].id} d={`M 360 320 Q ${360 + Math.cos(angle + .34) * 106} ${320 + Math.sin(angle + .34) * 106} ${x} ${y}`} className={`surname-rose-stem ${selectedIndex === index ? "is-active" : ""}`} />;
            })}
            {letters.map((letter, index) => {
              const angle = -90 + (index * 360 / Math.max(letters.length, 1));
              const radians = angle * Math.PI / 180;
              const isVowel = /[АЕЁИОУЫЭЮЯ]/u.test(letter);
              const inner = isVowel ? 154 : 161;
              const outer = isVowel ? 179 : 173;
              return (
                <g key={`${letter}-${index}`}>
                  <line x1={360 + Math.cos(radians) * inner} y1={320 + Math.sin(radians) * inner} x2={360 + Math.cos(radians) * outer} y2={320 + Math.sin(radians) * outer} className={isVowel ? "surname-rose-letter-tick is-vowel" : "surname-rose-letter-tick"} />
                  <text x={360 + Math.cos(radians) * 190} y={324 + Math.sin(radians) * 190} textAnchor="middle" className="surname-rose-letter">{letter}</text>
                </g>
              );
            })}
            <circle cx="360" cy="320" r="104" className="surname-rose-core-glow" filter={`url(#${visualId}-glow)`} />
            <circle cx="360" cy="320" r="102" className="surname-rose-core" />
            <text x="360" y="298" textAnchor="middle" className="surname-rose-monogram">{monogram || "ИФ"}</text>
            <text x="360" y="338" textAnchor="middle" className="surname-rose-name">{story.surname}</text>
            <text x="360" y="365" textAnchor="middle" className="surname-rose-form">{parts.stem} · {parts.suffix}</text>
          </svg>

          <div className="surname-rose-tabs" role="tablist" aria-label="Слои фамильной розы" data-testid="surname-atlas-traces">
            {layers.map((layer, index) => (
              <button
                key={layer.id}
                ref={(node) => { tabRefs.current[index] = node; }}
                type="button"
                role="tab"
                aria-label={`${index + 1}. ${layer.label}: ${layer.value}`}
                aria-selected={selectedIndex === index}
                aria-controls={`${visualId}-panel`}
                tabIndex={selectedIndex === index ? 0 : -1}
                className={`surname-rose-node surname-rose-node-${layer.tone} ${selectedIndex === index ? "is-active" : ""}`}
                style={{ left: `${positions[index].left}%`, top: `${positions[index].top}%` }}
                onClick={() => setSelectedIndex(index)}
                onKeyDown={(event) => selectFromKeyboard(index, event.key)}
              >
                <span className="surname-rose-node-number">{index + 1}</span>
                <span className="surname-rose-node-copy"><span>{layer.label}</span><small>{layer.value}</small></span>
              </button>
            ))}
          </div>
        </div>

        <div id={`${visualId}-panel`} role="tabpanel" className={`surname-rose-detail surname-rose-detail-${selectedLayer.tone}`} data-testid="surname-facts">
          <div className="surname-rose-detail-head">
            <div><p className="soft-eyebrow">слой {selectedIndex + 1} из {layers.length}</p><h3>{selectedLayer.label}</h3></div>
            <span>{selectedLayer.status}</span>
          </div>
          <p className="surname-rose-detail-value">{selectedLayer.value}</p>
          <p>{selectedLayer.detail}</p>
          <div className="surname-rose-action"><span aria-hidden="true">↗</span><p>{selectedLayer.action}</p></div>
        </div>

        <div className="surname-rose-legend" aria-label="Статусы сведений">
          <span><b className="surname-rose-key-observed" /> видно в форме</span>
          <span><b className="surname-rose-key-sourced" /> есть источник</span>
          <span><b className="surname-rose-key-hypothesis" /> версия</span>
          <span><b className="surname-rose-key-symbolic" /> символический слой</span>
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
    <div className="surname-rose-teaser" data-testid="surname-teaser">
      <div className="surname-rose-teaser-mark" aria-hidden="true">
        <svg viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="76" className="surname-rose-orbit surname-rose-orbit-outer" />
          <circle cx="90" cy="90" r="55" className="surname-rose-orbit" strokeDasharray="2 9" />
          {Array.from({ length: 6 }, (_, index) => {
            const angle = (-90 + index * 60) * Math.PI / 180;
            return <line key={index} x1="90" y1="90" x2={90 + Math.cos(angle) * 76} y2={90 + Math.sin(angle) * 76} className={`surname-rose-stem ${index > 1 ? "is-veiled" : "is-active"}`} />;
          })}
          <circle cx="90" cy="90" r="34" className="surname-rose-core" />
          <text x="90" y="100" textAnchor="middle" className="surname-rose-monogram surname-rose-teaser-monogram">{monogram}</text>
        </svg>
      </div>
      <div className="min-w-0 text-left">
        <p className="soft-eyebrow">ваша фамильная роза</p>
        {enteredSurname ? <><p className="mt-1 break-words font-heading text-xl text-[var(--soft-bordeaux)]">{parts.stem} · {parts.suffix}</p><p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">Знак начинает складываться. В полном разборе откроются шесть слоёв: от формы слова до образа характера и архивного маршрута.</p></> : <p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">Введите фамилию — персональный знак начнёт складываться из её букв, формы и звучания.</p>}
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
      eyebrow="ономастический атлас · 6 слоёв"
      heading="Ваша фамильная роза"
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
