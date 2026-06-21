"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, ChevronLeft, ChevronRight, Download, Heart, LockKeyhole, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { AutosavedNote } from "@/components/ui/autosaved-note";
import { TarotSpreadCards, ZodiacWheel } from "@/components/products/esoteric-chart-visuals";
import { useInputDraft } from "@/lib/use-input-draft";
import type { NatalWheel } from "@/lib/esoteric-chart";
import type { TarotCard, TarotSpreadKey } from "@/lib/symbolic-products";

type SymbolicResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: unknown;
};

type TarotCardView = TarotCard;
type TarotReadingMeta = { key?: TarotSpreadKey; label?: string; positions?: string[]; theme?: string };
type TarotRecs = {
  repeatCta: string;
  otherProduct: { slug: string; name: string; href: string } | null;
  specialist: { slug: string; name: string; title: string; pricePerSession: number; rationale: string } | null;
};

// Темы = сфера жизни (о ЧЁМ вопрос). Отдельная ось от расклада (СКОЛЬКО карт),
// чтобы не было пересечений вроде «Отношения» и там и там. Список сфер — по
// практике Таро (см. docs/Design/tarot-domain-research.md).
const TAROT_THEMES = [
  { key: "love", label: "Любовь и отношения" },
  { key: "work", label: "Работа и призвание" },
  { key: "money", label: "Деньги и быт" },
  { key: "family", label: "Семья и дом" },
  { key: "self", label: "Самопознание" },
  { key: "change", label: "Перемены и выбор" },
  { key: "daily", label: "На сегодня" },
] as const;

// Расклад = выбор глубины (named-раскладка), а не «сколько карт». Каноничная
// тройка: одна карта / три карты / Кельтский крест.
const TAROT_SPREAD_OPTIONS: Array<{
  key: TarotSpreadKey;
  label: string;
  helper: string;
  positions: string[];
}> = [
  { key: "one", label: "1 карта", helper: "быстрый ответ одной картой", positions: ["Совет"] },
  { key: "three", label: "3 карты", helper: "прошлое · настоящее · будущее", positions: ["Прошлое", "Настоящее", "Будущее"] },
  { key: "celtic", label: "Кельтский крест · 10", helper: "полный разбор, 10 карт", positions: ["Сейчас", "Вызов", "Прошлое", "Будущее", "Цель", "Основа", "Совет", "Внешнее", "Надежды и страхи", "Итог"] },
];

// #5: подсказки в поле вопроса зависят от выбранной темы и настойчиво просят
// указать имя и ПОЛНУЮ дату рождения людей, по которым делается расклад — это
// нужно, чтобы расклад был персональным. Примеры сменяются автоматически.
const TAROT_EXAMPLES_BY_THEME: Record<string, string[]> = {
  "Любовь и отношения": [
    "Анна, 14.03.1992 и Игорь, 02.07.1989 — вместе 3 года, появилась дистанция. Что между нами?",
    "Мария, 21.11.1990 — стоит ли давать шанс отношениям с Олегом, 05.09.1987?",
  ],
  "Работа и призвание": [
    "Дмитрий, 09.05.1988 — менять работу или остаться? Внутри много сомнений.",
    "Ольга, 30.01.1995 — куда расти дальше в карьере?",
  ],
  "Деньги и быт": [
    "Сергей, 17.08.1986 — тревожно из-за денег. На что опереться в ближайшие месяцы?",
    "Анна, 03.04.1991 — стоит ли сейчас брать ипотеку?",
  ],
  "Семья и дом": [
    "Елена, 03.12.1991 — напряжение с мамой (Нина, 25.06.1963). Как стать ближе?",
    "Игорь, 22.10.1984 — как не разрываться между родителями и своей семьёй?",
  ],
  "Самопознание": [
    "Игорь, 11.04.1993 — хочу понять свой повторяющийся сценарий. С чего начать?",
    "Мария, 28.07.1996 — что мешает мне почувствовать опору в себе?",
  ],
  "Перемены и выбор": [
    "Анна, 28.09.1990 — переезд в другой город: решиться или подождать?",
    "Павел, 16.02.1987 — два пути передо мной, как выбрать честно?",
  ],
  "На сегодня": [
    "Мария, 05.02.1994 — что важно увидеть в сегодняшнем дне?",
    "Дмитрий, 19.06.1990 — на что обратить внимание сегодня?",
  ],
};
const TAROT_EXAMPLES_DEFAULT = [
  "Укажите имя и полную дату рождения (напр. Анна, 14.03.1992) и ваш вопрос.",
  "О ком расклад? Имя и полная дата рождения каждого человека + что хотите понять.",
];
function tarotExamplesForTheme(theme: string): string[] {
  return TAROT_EXAMPLES_BY_THEME[theme] ?? TAROT_EXAMPLES_DEFAULT;
}

function isTarotSpreadKey(value: unknown): value is TarotSpreadKey {
  return TAROT_SPREAD_OPTIONS.some((option) => option.key === value);
}

function isTarotThemeLabel(value: unknown): value is (typeof TAROT_THEMES)[number]["label"] {
  return TAROT_THEMES.some((theme) => theme.label === value);
}

// #12: pull the real drawn cards out of the stored generation metadata (the
// route nests it under generationMetadata / previewGenerationMetadata).
function extractTarotCards(result: SymbolicResult | null): TarotCardView[] | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.cards ?? meta.cards) as unknown;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cards = raw.filter(
    (c): c is TarotCardView => !!c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string",
  );
  return cards.length > 0 ? cards : null;
}

function extractTarotMeta(result: SymbolicResult | null): TarotReadingMeta | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const rawSpread = (nested?.tarotSpread ?? meta.tarotSpread) as Record<string, unknown> | undefined;
  const rawTheme = (nested?.tarotTheme ?? meta.tarotTheme) as unknown;
  return {
    key: isTarotSpreadKey(rawSpread?.key) ? rawSpread.key : undefined,
    label: typeof rawSpread?.label === "string" ? rawSpread.label : undefined,
    positions: Array.isArray(rawSpread?.positions) ? rawSpread.positions.filter((item): item is string => typeof item === "string") : undefined,
    theme: typeof rawTheme === "string" ? rawTheme : undefined,
  };
}

// B388: натальное колесо хранится в metadata так же, как карты Таро.
function extractNatalWheel(result: SymbolicResult | null): NatalWheel | null {
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

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: SymbolicResult;
  results?: SymbolicResult[];
  paywalled?: boolean;
  error?: string;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((payload as ApiPayload).error ?? "Не удалось выполнить действие");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

// #2: горизонтально прокручиваемая лента выбора с кликабельными стрелками по
// краям. Стрелка появляется только если есть куда скроллить в эту сторону;
// клик плавно сдвигает ленту в сторону нажатой стрелки.
function ScrollStrip({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  function scrollByDir(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  }

  return (
    <div className="tarot-strip">
      {canLeft && (
        <button
          type="button"
          className="tarot-strip-arrow tarot-strip-arrow-left"
          onClick={() => scrollByDir(-1)}
          aria-label="Прокрутить влево"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
      )}
      <div ref={ref} className="tarot-strip-track" role="group" aria-label={ariaLabel} onScroll={update}>
        {children}
      </div>
      {canRight && (
        <button
          type="button"
          className="tarot-strip-arrow tarot-strip-arrow-right"
          onClick={() => scrollByDir(1)}
          aria-label="Прокрутить вправо"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function TarotDeckPreview({ spread }: { spread: (typeof TAROT_SPREAD_OPTIONS)[number] }) {
  return (
    <div className="tarot-deck-preview" data-card-count={Math.min(spread.positions.length, 10)} data-testid="tarot-deck-preview" aria-label={`Карты расклада: ${spread.label}`}>
      {spread.positions.map((position, index) => (
        <figure key={`${position}-${index}`} className="tarot-card-cell">
          <div className="tarot-card-back">
            <span className="tarot-card-back-mark" aria-hidden="true">ET</span>
          </div>
          {/* #6: подпись позиции — СНАРУЖИ карты (снизу), а не поверх неё. */}
          <figcaption className="tarot-card-caption">
            <span className="tarot-card-position">{position}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function TarotResultSummary({ cards }: { cards: TarotCardView[] }) {
  // #7: тема/расклад больше НЕ дублируются здесь — они показаны в раскрываемом
  // элементе «Тема, вопрос и расклад» над раскладом. Тут только трактовки карт.
  return (
    <div className="tarot-result-summary" data-testid="tarot-result-summary">
      <div className="tarot-card-meaning-list">
        {cards.map((card) => (
          <article key={card.position} className="tarot-card-meaning">
            <p className="tarot-card-meaning-position">{card.position}</p>
            <h3>{card.name}{card.reversed ? " · перевёрнутая" : ""}</h3>
            <p>{card.meaning}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function SymbolicProductActions({
  productKey,
  title,
  promptLabel,
  placeholder,
  creditCost,
}: {
  productKey: "tarot" | "natal-chart" | "numerology" | "family-scenarios";
  title: string;
  promptLabel: string;
  placeholder: string;
  creditCost: number;
}) {
  const { status: authStatus } = useSession();
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [result, setResult] = useState<SymbolicResult | null>(null);
  const [userInput, setUserInput] = useState("");
  const [tarotTheme, setTarotTheme] = useState<(typeof TAROT_THEMES)[number]["label"]>(TAROT_THEMES[0].label);
  const [tarotSpread, setTarotSpread] = useState<TarotSpreadKey>("three");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [tarotRecs, setTarotRecs] = useState<TarotRecs | null>(null);
  // #2: read-only «Тема, вопрос и расклад» disclosure on the result.
  const [recapOpen, setRecapOpen] = useState(false);
  const draftKey = `symbolic:${productKey}`;

  const syncTarotControlsFromResult = useCallback((nextResult: SymbolicResult | null) => {
    if (productKey !== "tarot") return;
    const meta = extractTarotMeta(nextResult);
    if (meta?.key) setTarotSpread(meta.key);
    if (isTarotThemeLabel(meta?.theme)) setTarotTheme(meta.theme);
  }, [productKey]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/symbolic?productKey=${productKey}`)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        // #1: the tarot reading is session-scoped — it is restored from the
        // ?reading=<id> URL param (effect below), NOT auto-loaded from the last
        // DB result. So a fresh visit / refresh of the bare page starts over.
        // Other symbolic products keep showing the last result on revisit.
        if (productKey !== "tarot") {
          const nextResult = payload.results?.[0] ?? null;
          setResult(nextResult);
          syncTarotControlsFromResult(nextResult);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, productKey, syncTarotControlsFromResult]);

  // #1: restore a tarot reading from ?reading=<id> (browser back/forward and a
  // same-tab refresh of that URL keep the result). A fresh visit to the bare
  // /products/tarot has no param → starts a new session.
  useEffect(() => {
    if (productKey !== "tarot" || authStatus !== "authenticated" || typeof window === "undefined") return;
    const readingId = new URLSearchParams(window.location.search).get("reading");
    if (!readingId) return;
    let cancelled = false;
    jsonRequest<{ result?: SymbolicResult }>(`/api/products/symbolic/${readingId}`)
      .then((payload) => {
        if (cancelled || !payload.result) return;
        setResult(payload.result);
        syncTarotControlsFromResult(payload.result);
        const md = payload.result.metadata as { userInput?: unknown } | undefined;
        if (md && typeof md.userInput === "string") setUserInput(md.userInput);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [productKey, authStatus, syncTarotControlsFromResult]);

  // #2: примеры вопроса для Таро сменяются автоматически — живая подсказка,
  // как на /checkin. Только для Таро.
  useEffect(() => {
    if (productKey !== "tarot") return;
    const id = window.setInterval(() => setExampleIdx((index) => index + 1), 3600);
    return () => window.clearInterval(id);
  }, [productKey]);

  // #3: ввод переживает переход на /login — восстанавливаем при возврате и
  // сохраняем по мере заполнения (общий хук для всех услуг). active=!result,
  // чтобы готовый результат не перезаписывал черновик.
  const { clear: clearDraft } = useInputDraft(
    draftKey,
    productKey === "tarot" ? { userInput, tarotTheme, tarotSpread } : { userInput },
    (draft) => {
      if (typeof draft.userInput === "string") setUserInput(draft.userInput);
      if (productKey === "tarot") {
        if (isTarotThemeLabel(draft.tarotTheme)) setTarotTheme(draft.tarotTheme);
        if (isTarotSpreadKey(draft.tarotSpread)) setTarotSpread(draft.tarotSpread);
      }
    },
    { active: !result },
  );

  // #6: после готового расклада подтягиваем рекомендации (повтор услуги под тему
  // + смежная услуга + специалист-эзотерик). Best-effort; setState только из
  // колбэков (then/микротаск), чтобы не дёргать рендер синхронно из эффекта.
  useEffect(() => {
    let cancelled = false;
    if (productKey !== "tarot" || !result?.id || !result.resultText) {
      void Promise.resolve().then(() => { if (!cancelled) setTarotRecs(null); });
      return () => { cancelled = true; };
    }
    jsonRequest<TarotRecs>(`/api/products/symbolic/${result.id}/recommendations`)
      .then((data) => { if (!cancelled) setTarotRecs(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [productKey, result?.id, result?.resultText]);

  async function generateResult() {
    if (authStatus !== "authenticated") {
      setMessage("Войдите, чтобы открыть продукт и сохранить результат в кабинете.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const selectedSpread = TAROT_SPREAD_OPTIONS.find((option) => option.key === tarotSpread) ?? TAROT_SPREAD_OPTIONS[1];
      const payload = await jsonRequest<ApiPayload>("/api/products/symbolic", {
        method: "POST",
        body: JSON.stringify({
          productKey,
          userInput,
          ...(productKey === "tarot" ? { tarotSpread: selectedSpread.key, tarotTheme } : {}),
        }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      const nextResult = payload.result ?? null;
      setResult(nextResult);
      syncTarotControlsFromResult(nextResult);
      // #3: получили результат — черновик ввода больше не нужен.
      if (!payload.paywalled) clearDraft();
      // #1: привязываем расклад к URL ?reading=<id>, чтобы он восстанавливался
      // по назад/вперёд, но не «прилипал» при свежем заходе на страницу.
      if (productKey === "tarot" && nextResult?.id && nextResult.resultText && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("reading", nextResult.id);
        window.history.replaceState(null, "", url.toString());
      }
      if (payload.paywalled) {
        setMessage(productKey === "tarot" ? "Откройте доступ баллами или картой, и расклад появится здесь же." : "Бесплатный фрагмент готов. Полный разбор можно открыть баллами или картой.");
      }
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setMessage("Откройте доступ баллами или картой — полный результат появится здесь же.");
      } else {
        setMessage(typed.message || "Не удалось создать результат");
      }
      setStatus("error");
    }
  }

  // B308: real save → PATCH /api/products/symbolic/[id] with action: "save".
  // Spec (04_UI_UX_Mechanics §10) requires every symbolic result to be
  // saveable into the user's Мою карту (диалоги/результаты Дневника).
  async function saveToMap() {
    if (!result) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/symbolic/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "save" }),
      });
      setResult(payload.result ?? result);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить в Мою карту");
      setStatus("error");
    }
  }

  // #5/#6: повтор расклада — очищаем текущий результат, чтобы вернуться к форме
  // и пройти механику заново (текст кнопки-CTA подбирается под тему вопроса).
  // Каждый новый расклад снова списывает баллы (или оплачивается), т.к.
  // entitlement гасится на каждой генерации (INC-025).
  function resetReading() {
    setResult(null);
    setMessage(null);
    setStatus("idle");
    setUserInput("");
    clearDraft();
    if (productKey === "tarot" && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("reading");
      window.history.replaceState(null, "", url.toString());
    }
  }

  const tarotCards = productKey === "tarot" ? extractTarotCards(result) : null;
  const tarotMeta = productKey === "tarot" ? extractTarotMeta(result) : null;
  const natalWheel = productKey === "natal-chart" ? extractNatalWheel(result) : null;
  const selectedTarotSpread = TAROT_SPREAD_OPTIONS.find((option) => option.key === tarotSpread) ?? TAROT_SPREAD_OPTIONS[1];

  if (productKey === "tarot") {
    const hasReading = Boolean(result?.resultText && tarotCards);
    // #5: подсказка зависит от выбранной темы; сменяется по таймеру.
    const themeExamples = tarotExamplesForTheme(tarotTheme);
    const tarotPlaceholder = themeExamples[exampleIdx % themeExamples.length];

    // Блок управления: тема → расклад (компактная прокручиваемая лента, #2) →
    // вопрос → действие. После расклада он сворачивается в раскрываемый элемент.
    const controls = (
      <div className="tarot-controls">
        <ScrollStrip ariaLabel="Категория вопроса">
          {TAROT_THEMES.map((theme) => (
            <button
              key={theme.key}
              type="button"
              className={theme.label === tarotTheme ? "tarot-choice tarot-choice-active" : "tarot-choice"}
              onClick={() => { setTarotTheme(theme.label); setExampleIdx(0); }}
              aria-pressed={theme.label === tarotTheme}
              disabled={status === "loading"}
            >
              {theme.label}
            </button>
          ))}
        </ScrollStrip>

        <ScrollStrip ariaLabel="Тип расклада">
          {TAROT_SPREAD_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={option.key === tarotSpread ? "tarot-spread-choice tarot-choice-active" : "tarot-spread-choice"}
              onClick={() => setTarotSpread(option.key)}
              aria-pressed={option.key === tarotSpread}
              title={option.helper}
              disabled={status === "loading"}
            >
              {option.label}
            </button>
          ))}
        </ScrollStrip>

        <label className="soft-eyebrow tarot-question-label" htmlFor="symbolic-input-tarot">{promptLabel}</label>
        <textarea
          id="symbolic-input-tarot"
          value={userInput}
          onChange={(event) => setUserInput(event.target.value)}
          placeholder={tarotPlaceholder}
          rows={3}
          className="soft-question-input tarot-question-input"
          disabled={status === "loading"}
        />

        <div className="tarot-action-row">
          {hasEntitlement ? (
            <Button
              type="button"
              onClick={generateResult}
              disabled={status === "loading"}
              className="soft-button soft-button-primary"
            >
              <LockKeyhole className="size-4" aria-hidden="true" />
              {status === "loading" ? "Тянем карты" : "Получить полный расклад"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey={productKey}
              label="Открыть расклад"
              checkoutSource="tarot-direct"
              creditCost={creditCost}
              onUnlocked={() => {
                setHasEntitlement(true);
                if (userInput.trim()) {
                  void generateResult();
                } else {
                  setMessage("Доступ открыт. Добавьте вопрос, и карты появятся здесь же.");
                }
              }}
            />
          )}
        </div>
      </div>
    );

    return (
      <div className="soft-card tarot-order-surface" data-testid="tarot-product-actions">
        <div data-testid="symbolic-product-actions-tarot">
          <div className="tarot-head">
            <p className="soft-eyebrow">тема и расклад</p>
            {hasEntitlement && !hasReading && <p className="tarot-access-note">Доступ открыт, можно тянуть карты.</p>}
          </div>

          {message && <p className="tarot-order-message">{message}</p>}

          {/* #2: после получения расклада исходные данные показываются только для
              чтения (показать/скрыть) — изменить их уже нельзя, услуга заказана. */}
          {hasReading ? (
            <details
              className="tarot-controls-collapsed"
              data-testid="tarot-recap"
              open={recapOpen}
              onToggle={(event) => setRecapOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>
                <span className="tarot-collapsed-q">
                  {userInput.trim() ? `Вопрос: ${userInput.trim()}` : "Тема, вопрос и расклад"}
                </span>
                <span className="tarot-collapsed-hint">{recapOpen ? "скрыть" : "показать"}</span>
              </summary>
              <dl className="tarot-recap">
                <div>
                  <dt>Тема</dt>
                  <dd>{tarotMeta?.theme ?? tarotTheme}</dd>
                </div>
                <div>
                  <dt>Расклад</dt>
                  <dd>{tarotMeta?.label ?? selectedTarotSpread.label}</dd>
                </div>
                {userInput.trim() && (
                  <div>
                    <dt>Вопрос</dt>
                    <dd>{userInput.trim()}</dd>
                  </div>
                )}
              </dl>
            </details>
          ) : (
            controls
          )}

          <div className="tarot-reveal" data-testid="tarot-reveal">
            {tarotCards ? <TarotSpreadCards cards={tarotCards} /> : <TarotDeckPreview spread={selectedTarotSpread} />}

            {result?.resultText && tarotCards ? (
              <>
                <TarotResultSummary cards={tarotCards} />
                <SoftMarkdown
                  content={result.resultText}
                  className="mt-3 font-heading text-[1.02rem] text-[var(--soft-ink)]"
                />
                {/* #6: расклад уже сохранён в Дневник автоматически (savedAt в API),
                    отдельной кнопки и экспорта в PDF тут нет — человек читает весь
                    разбор на странице. Вместо «Нового расклада» — блок «что дальше». */}
                <div className="tarot-followup" data-testid="tarot-followup">
                  <AutosavedNote testId="tarot-autosaved" />
                  <p className="soft-eyebrow">что дальше</p>
                  <div className="tarot-followup-row">
                    <Button
                      type="button"
                      onClick={resetReading}
                      className="soft-button soft-button-primary tarot-followup-primary"
                      data-testid="tarot-new-reading"
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                      {tarotRecs?.repeatCta ?? "Задать картам новый вопрос"}
                    </Button>
                    {tarotRecs?.otherProduct && (
                      <a
                        href={tarotRecs.otherProduct.href}
                        className="soft-button soft-button-ghost tarot-followup-other"
                        data-testid="tarot-other-product"
                      >
                        {tarotRecs.otherProduct.name}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  {tarotRecs?.specialist && (
                    <a
                      href={`/practitioners/${tarotRecs.specialist.slug}`}
                      className="tarot-specialist-rec"
                      data-testid="tarot-specialist-rec"
                    >
                      <span className="tarot-specialist-avatar" aria-hidden="true">
                        <Heart className="size-4" />
                      </span>
                      <span className="tarot-specialist-body">
                        <span className="tarot-specialist-name">
                          {tarotRecs.specialist.name} · {tarotRecs.specialist.title}
                          <span className="tarot-specialist-tag">человек рядом</span>
                        </span>
                        <span className="tarot-specialist-rationale">{tarotRecs.specialist.rationale}</span>
                      </span>
                      <span className="tarot-specialist-price">
                        от {tarotRecs.specialist.pricePerSession.toLocaleString("ru-RU")} ₽
                      </span>
                    </a>
                  )}
                </div>
              </>
            ) : result?.previewText ? (
              <>
                <SoftMarkdown
                  content={result.previewText}
                  className="mt-3 font-heading text-[1.02rem] text-[var(--soft-ink)]"
                />
                <p className="tarot-preview-note">
                  Полный расклад откроет все карты, общий смысл и сохранение в Дневник.
                </p>
              </>
            ) : (
              <p className="tarot-empty-copy">
                Выберите тему и расклад. Карты лягут здесь, а текст свяжет символы с вашим вопросом.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid={`symbolic-product-actions-${productKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">получить продукт</p>
          <h2 className="soft-h3 mt-2">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Полный разбор открывается баллами или картой — результат появится здесь же. Можно начать с бесплатного фрагмента.
          </p>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "доступ открыт" : "фрагмент бесплатно"}
        </span>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
          {message}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <div className="soft-card-flat p-5">
          <label className="soft-eyebrow" htmlFor={`symbolic-input-${productKey}`}>{promptLabel}</label>
          <textarea
            id={`symbolic-input-${productKey}`}
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            placeholder={placeholder}
            rows={6}
            className="soft-question-input mt-3"
            disabled={status === "loading"}
          />
          {/* #7: one clear order action. The PAID CTA (credits → full result in
              one click) is primary; the free fragment is a quiet secondary link
              so users no longer mistake the teaser for the order and pay twice. */}
          <div className="mt-4 flex flex-col gap-3">
            {hasEntitlement ? (
              <Button
                type="button"
                onClick={generateResult}
                disabled={status === "loading"}
                className="soft-button soft-button-primary"
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                {status === "loading" ? "Собираем результат" : "Получить полный результат"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : (
              <>
                <ProductPurchaseControls
                  productKey={productKey}
                  label={`Открыть ${title}`}
                  checkoutSource={`${productKey}-direct`}
                  creditCost={creditCost}
                  onUnlocked={() => {
                    setHasEntitlement(true);
                    if (userInput.trim()) {
                      void generateResult();
                    } else {
                      setMessage("Доступ открыт. Добавьте данные или вопрос — и получите результат здесь же.");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={generateResult}
                  disabled={status === "loading"}
                  className="self-start text-sm font-medium text-[var(--soft-bordeaux)] underline underline-offset-4 disabled:opacity-50"
                  data-testid={`symbolic-free-fragment-${productKey}`}
                >
                  {status === "loading" ? "Собираем фрагмент…" : "Сначала бесплатный фрагмент"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="soft-card p-5">
          <p className="soft-eyebrow">результат</p>
          {tarotCards && <TarotSpreadCards cards={tarotCards} />}
          {natalWheel && <div className="mt-3"><ZodiacWheel wheel={natalWheel} /></div>}
          {result?.resultText ? (
            <>
              <SoftMarkdown
                content={result.resultText}
                className="mt-3 font-heading text-[1.08rem] text-[var(--soft-ink)]"
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={saveToMap}
                  disabled={result.saved || status === "loading"}
                  className="soft-button soft-button-ghost"
                  data-testid={`symbolic-save-${productKey}`}
                >
                  <Save className="size-4" aria-hidden="true" />
                  {result.saved ? "Сохранено в Мою карту" : status === "loading" ? "Сохраняем…" : "Сохранить в Мою карту"}
                </Button>
                {/* B388: PDF с отрисовкой визуала (колесо/расклад), не только текст. */}
                <a
                  href={`/products/print/${result.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="soft-button soft-button-ghost"
                  data-testid={`symbolic-pdf-${productKey}`}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Скачать PDF
                </a>
              </div>
            </>
          ) : result?.previewText ? (
            <>
              <SoftMarkdown
                content={result.previewText}
                className="mt-3 font-heading text-[1.08rem] text-[var(--soft-ink)]"
              />
              <p className="mt-4 rounded-[16px] bg-[var(--soft-paper-deep)] p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Это бесплатный фрагмент. Полный разбор откроет остальные блоки и сохранение в Мою карту.
              </p>
            </>
          ) : (
            <p className="mt-3 font-heading text-xl italic leading-relaxed text-[var(--soft-ink-soft)]">
              Введите вопрос или данные — здесь появится первый настоящий фрагмент до оплаты.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
