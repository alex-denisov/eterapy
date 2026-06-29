// B463 (M28, walkthrough item 21): «Вместе» hub display + «Ваша связь» relationship
// mode. The hub now shows TWO scenarios (the orphaned «Совместимость» card is folded
// into «Сверить взгляды» as a relationship-type mode named «Ваша связь»). Pure data +
// helpers only — no React, no server imports — so it is safe in client bundles and
// unit-testable.

export type PairHubScenarioKey = "outside" | "compare";

export interface PairHubScenario {
  key: PairHubScenarioKey;
  /** Pill label in the hub picker. */
  label: string;
  /** Plain, calm description shown under the picker for the active scenario. */
  description: string;
}

export const PAIR_HUB_SCENARIOS: readonly PairHubScenario[] = [
  {
    key: "outside",
    label: "Свежий взгляд",
    description:
      "Опишите, что происходит — мы соберём пару бережных нейтральных вопросов. " +
      "Близкий ответит по ссылке за 2–3 минуты, без регистрации и не видя ваших " +
      "деталей. Разбор получите вы.",
  },
  {
    key: "compare",
    label: "Сверить взгляды",
    description:
      "Вы оба отвечаете — каждый со своей стороны. Общий бережный разбор открывается " +
      "только по согласию обоих. Можно про один вопрос или про ваши отношения в " +
      "целом — это «Ваша связь».",
  },
] as const;

// The hub only ever distinguishes outside vs compare. The retired «compatibility»
// deep-link now resolves to the two-party compare flow (where «Ваша связь» lives).
export function resolvePairScenario(param: string | null | undefined): PairHubScenarioKey {
  return param === "compare" || param === "compatibility" ? "compare" : "outside";
}

// ── «Ваша связь» relationship mode ───────────────────────────────────────────
// Light, non-clinical structuring of the two-party self-view. The key maps to the
// compatibility engine's `type`; the prompts re-skin by relationship so «пара» and
// «коллеги» never read the same.

// Keys match the compatibility API `type` enum, which feeds the engine prompt
// (lib/compatibility.ts). «коллеги» maps to "business".
export type PairRelationshipType = "romantic" | "friendship" | "family" | "business";

export interface PairRelationshipOption {
  key: PairRelationshipType;
  /** Pill label (relationship chooser). */
  label: string;
  /** First guided prompt, framed warmly for this relationship. */
  warmthPrompt: string;
  /** Result eyebrow framing for this relationship (verdict-free). */
  resultEyebrow: string;
}

export const PAIR_RELATIONSHIP_OPTIONS: readonly PairRelationshipOption[] = [
  {
    key: "romantic",
    label: "пара",
    warmthPrompt: "Что в ваших отношениях сейчас самое тёплое?",
    resultEyebrow: "взгляд на вашу пару",
  },
  {
    key: "friendship",
    label: "друзья",
    warmthPrompt: "Что в этой дружбе вам сейчас особенно ценно?",
    resultEyebrow: "взгляд на вашу дружбу",
  },
  {
    key: "family",
    label: "семья",
    warmthPrompt: "Что в этих семейных отношениях сейчас держит тепло?",
    resultEyebrow: "взгляд на ваши семейные отношения",
  },
  {
    key: "business",
    label: "коллеги",
    warmthPrompt: "Что в этой рабочей связке сейчас работает хорошо?",
    resultEyebrow: "взгляд на вашу рабочую связь",
  },
] as const;

export const PAIR_TENSION_PROMPT = "Где чаще всего возникает напряжение?";
export const PAIR_QUESTION_PROMPT = "Один конкретный вопрос — необязательно";

// ── Сессионность (?reading=<id>) ─────────────────────────────────────────────
// B465: «Вместе» прежде не имела сессий — оба сценария (circle/compatibility)
// молча подтягивали последний результат и не отражали активную сессию в URL.
// Приводим к общему паттерну услуг (см. use-symbolic-service.ts): активный разбор
// закрепляется в `?reading=<id>` через history.replaceState, refresh/back
// восстанавливает именно его, а свежий заход без параметра = новая сессия.
// Чистые строковые помощники — без React/window, юнит-тестируемы.

export const PAIR_READING_PARAM = "reading";

/** Read the pinned reading id from a `?…` search string or URLSearchParams. */
export function readingIdFromSearch(search: string | URLSearchParams): string | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const value = params.get(PAIR_READING_PARAM)?.trim();
  return value ? value : null;
}

/**
 * Return `pathname?search` with `reading=<id>` set (preserving any other params,
 * e.g. `scenario`). Pass the current `window.location` parts; output is a relative
 * URL safe for `history.replaceState`.
 */
export function withReadingParam(pathname: string, search: string, readingId: string): string {
  const params = new URLSearchParams(search);
  params.set(PAIR_READING_PARAM, readingId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Return `pathname?search` with `reading` removed (used by reset / «новый разбор»). */
export function withoutReadingParam(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete(PAIR_READING_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Find the session whose id matches the pinned `?reading=` (restore-by-id). */
export function findReadingById<T extends { id: string }>(
  items: readonly T[] | null | undefined,
  readingId: string | null,
): T | null {
  if (!readingId || !items) return null;
  return items.find((item) => item.id === readingId) ?? null;
}

export function getPairRelationshipOption(key: string): PairRelationshipOption | null {
  return PAIR_RELATIONSHIP_OPTIONS.find((option) => option.key === key) ?? null;
}

export function defaultPairRelationship(): PairRelationshipOption {
  return PAIR_RELATIONSHIP_OPTIONS[0];
}

// Fold the calm guided answers into the single free-text the compatibility engine
// already accepts as the creator's "your side". Keeps the backend untouched while the
// UI gets structured, relationship-aware prompts. The optional concrete question is
// only appended when present.
export function composePairSelfView(input: {
  type: PairRelationshipType;
  warmth: string;
  tension: string;
  question?: string;
}): string {
  const option = getPairRelationshipOption(input.type) ?? defaultPairRelationship();
  const warmthLabel = option.warmthPrompt.replace(/\?$/, "");
  const tensionLabel = PAIR_TENSION_PROMPT.replace(/\?$/, "");
  const lines = [
    `${warmthLabel}: ${input.warmth.trim()}`,
    `${tensionLabel}: ${input.tension.trim()}`,
  ];
  const question = input.question?.trim();
  if (question) {
    lines.push(`Хочется прояснить: ${question}`);
  }
  return lines.join("\n");
}
