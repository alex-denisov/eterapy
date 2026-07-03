/**
 * W3: single source of truth for the THREE-LEVEL practitioner taxonomy.
 *
 *   Level 1 — Специализация (category):  Психология, Коучинг, Юристы, Финансы,
 *             Эзотерика, Совместные сессии.
 *   Level 2 — Направление (direction):   per-category schools/practice areas
 *             (КПТ, Гештальт-терапия, Семейное право …).
 *   Level 3 — Задачи (tasks):            concrete problems a specialist solves
 *             (тревога, развод, инвестиции …) — stored on `Practitioner.tags`.
 *
 * Every surface imports from here so the hierarchy stays in sync across:
 *   • the public /practitioners filters + each practitioner card,
 *   • the practitioner profile editor (cabinet),
 *   • the admin user-management modal,
 *   • the dialogue-result recommendation engine (W17).
 *
 * The esoteric directions are kept 1:1 with the Prisma `Specialty` enum so the
 * legacy esoteric surfaces (showcase, specialty labels) keep working while the
 * richer category/direction model is layered on top.
 */
import type { DialogueTopic } from "@/lib/product-format-recommendations";

export type CategoryId =
  | "psychology"
  | "coaching"
  | "legal"
  | "finance"
  | "esoteric"
  | "joint";

export interface TaxonomyOption {
  id: string;
  label: string;
}

export interface CategoryNode extends TaxonomyOption {
  id: CategoryId;
}

export const CATEGORIES: CategoryNode[] = [
  { id: "psychology", label: "Психология" },
  { id: "coaching", label: "Коучинг" },
  { id: "legal", label: "Юристы" },
  { id: "finance", label: "Финансы" },
  { id: "esoteric", label: "Эзотерика" },
  { id: "joint", label: "Совместные сессии" },
];

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

/** Level 2 — направления per category. */
export const DIRECTIONS_BY_CATEGORY: Record<CategoryId, TaxonomyOption[]> = {
  psychology: [
    { id: "cbt", label: "КПТ (когнитивно-поведенческая)" },
    { id: "gestalt", label: "Гештальт-терапия" },
    { id: "psychoanalysis", label: "Психоанализ" },
    { id: "family-systems", label: "Системная семейная терапия" },
    { id: "schema", label: "Схема-терапия" },
    { id: "emdr", label: "EMDR · работа с травмой" },
    { id: "existential", label: "Экзистенциальная терапия" },
    { id: "body", label: "Телесно-ориентированная терапия" },
    { id: "art", label: "Арт-терапия" },
    { id: "integrative", label: "Интегративный подход" },
  ],
  coaching: [
    { id: "life", label: "Лайф-коучинг" },
    { id: "career", label: "Карьерный коучинг" },
    { id: "business", label: "Бизнес-коучинг" },
    { id: "relationship", label: "Коучинг отношений" },
    { id: "transformational", label: "Трансформационный коучинг" },
    { id: "health", label: "Коучинг здоровья и образа жизни" },
  ],
  legal: [
    { id: "family-law", label: "Семейное право" },
    { id: "labor-law", label: "Трудовое право" },
    { id: "housing-law", label: "Жилищное право" },
    { id: "contract-law", label: "Договорное право" },
    { id: "consumer-law", label: "Защита прав потребителей" },
    { id: "inheritance-law", label: "Наследственное право" },
  ],
  finance: [
    { id: "personal-finance", label: "Личные финансы" },
    { id: "investing", label: "Инвестиции" },
    { id: "financial-planning", label: "Финансовое планирование" },
    { id: "taxes", label: "Налоги и вычеты" },
    { id: "debt", label: "Долги и антикризис" },
  ],
  esoteric: [
    { id: "tarot", label: "Таро" },
    { id: "astrology", label: "Астрология" },
    { id: "numerology", label: "Нумерология" },
    { id: "psychic", label: "Экстрасенсорика" },
    { id: "runes", label: "Руны" },
    { id: "dreams", label: "Работа со сновидениями" },
  ],
  joint: [
    { id: "eso-therapy", label: "Эзотерик + психотерапевт" },
    { id: "couple", label: "Парная сессия" },
    { id: "family-session", label: "Семейная сессия" },
  ],
};

/** Level 3 — задачи (suggested chips) per category. Free-text also allowed. */
export const TASKS_BY_CATEGORY: Record<CategoryId, string[]> = {
  psychology: [
    "Тревога", "Депрессия", "Панические атаки", "Самооценка", "Отношения",
    "Развод", "Утрата и горе", "Зависимости", "Выгорание", "Стресс",
    "Психотравма", "Одиночество", "Психосоматика", "Детско-родительские отношения",
    "Сепарация",
  ],
  coaching: [
    "Карьера", "Смена профессии", "Поиск призвания", "Цели и мотивация",
    "Баланс работы и жизни", "Лидерство", "Принятие решений", "Прокрастинация",
    "Уверенность",
  ],
  legal: [
    "Развод", "Раздел имущества", "Алименты", "Опека над детьми", "Трудовой спор",
    "Увольнение", "Жилищный вопрос", "Наследство", "Защита прав потребителя",
    "Договор",
  ],
  finance: [
    "Бюджет и накопления", "Долги и кредиты", "Инвестиции", "Финансовая подушка",
    "Пенсионное планирование", "Налоговый вычет", "Финансы пары",
  ],
  esoteric: [
    "Отношения", "Выбор пути", "Самопознание", "Совместимость", "Прогноз года",
    "Поиск ответа", "Предназначение",
  ],
  joint: [
    "Отношения в паре", "Семейный конфликт", "Сложное решение", "Глубокий самоанализ",
  ],
};

// ─── Esoteric direction ↔ Prisma Specialty enum bridge ───────────────────────

/** esoteric direction id → Specialty enum value */
export const ESOTERIC_DIRECTION_TO_SPECIALTY: Record<string, string> = {
  tarot: "TAROT",
  astrology: "ASTROLOGY",
  numerology: "NUMEROLOGY",
  psychic: "PSYCHIC",
  runes: "RUNES",
  dreams: "DREAMS",
};

/** Specialty enum value → esoteric direction id */
export const SPECIALTY_TO_ESOTERIC_DIRECTION: Record<string, string> = Object.fromEntries(
  Object.entries(ESOTERIC_DIRECTION_TO_SPECIALTY).map(([dir, spec]) => [spec, dir]),
);

const DIRECTION_LABELS: Record<string, string> = Object.fromEntries(
  (Object.keys(DIRECTIONS_BY_CATEGORY) as CategoryId[]).flatMap((cat) =>
    DIRECTIONS_BY_CATEGORY[cat].map((d) => [d.id, d.label]),
  ),
);

const DIRECTION_TO_CATEGORY: Record<string, CategoryId> = Object.fromEntries(
  (Object.keys(DIRECTIONS_BY_CATEGORY) as CategoryId[]).flatMap((cat) =>
    DIRECTIONS_BY_CATEGORY[cat].map((d) => [d.id, cat]),
  ),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] ?? id;
}

export function directionLabel(id: string): string {
  return DIRECTION_LABELS[id] ?? id;
}

export function categoryIdForDirection(directionId: string): CategoryId | null {
  return DIRECTION_TO_CATEGORY[directionId] ?? null;
}

/** Directions available for the given selected categories (ordered, deduped). */
export function directionsForCategories(categoryIds: string[]): TaxonomyOption[] {
  const out: TaxonomyOption[] = [];
  for (const cat of CATEGORIES) {
    if (categoryIds.includes(cat.id)) out.push(...DIRECTIONS_BY_CATEGORY[cat.id]);
  }
  return out;
}

/** Suggested tasks for the given selected categories (deduped, ordered). */
export function tasksForCategories(categoryIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cat of CATEGORIES) {
    if (!categoryIds.includes(cat.id)) continue;
    for (const task of TASKS_BY_CATEGORY[cat.id]) {
      const key = task.toLocaleLowerCase("ru-RU");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(task);
      }
    }
  }
  return out;
}

/** Map a list of esoteric direction ids → Specialty enum values (for DB sync). */
export function specialtiesForDirections(directionIds: string[]): string[] {
  return directionIds
    .map((d) => ESOTERIC_DIRECTION_TO_SPECIALTY[d])
    .filter((s): s is string => Boolean(s));
}

/** Map Specialty enum values → esoteric direction ids. */
export function directionsForSpecialties(specialties: string[]): string[] {
  return specialties
    .map((s) => SPECIALTY_TO_ESOTERIC_DIRECTION[s])
    .filter((d): d is string => Boolean(d));
}

/**
 * Backward-compatible category inference for practitioners that pre-date the
 * explicit `categories` field. Mirrors the old landing `detectCategory`
 * heuristic but returns the full set of matching categories.
 */
export function detectCategoriesFromLegacy(input: {
  specialties?: string[];
  title?: string | null;
}): CategoryId[] {
  const out = new Set<CategoryId>();
  const title = (input.title ?? "").toLowerCase();
  const specialties = (input.specialties ?? []).map((s) => s.toLowerCase());

  if (
    specialties.some((s) => s in ESOTERIC_DIRECTION_TO_SPECIALTY) ||
    (input.specialties ?? []).some((s) => s in SPECIALTY_TO_ESOTERIC_DIRECTION) ||
    title.includes("таро") || title.includes("астролог") ||
    title.includes("нумеролог") || title.includes("эзотери") ||
    title.includes("экстрасенс") || title.includes("рун")
  ) {
    out.add("esoteric");
  }
  if (title.includes("психолог") || title.includes("терапевт") || title.includes("психиатр")) out.add("psychology");
  if (title.includes("коуч")) out.add("coaching");
  if (title.includes("юрист") || title.includes("адвокат") || title.includes("правов")) out.add("legal");
  if (title.includes("финанс") || title.includes("бухгалтер") || title.includes("эконом")) out.add("finance");

  if (out.size === 0) out.add("psychology");
  return [...out];
}

/** Resolve a practitioner's effective categories (explicit, else inferred). */
export function effectiveCategories(input: {
  categories?: string[];
  specialties?: string[];
  title?: string | null;
}): CategoryId[] {
  if (input.categories && input.categories.length > 0) {
    return input.categories.filter((c): c is CategoryId => c in CATEGORY_LABELS);
  }
  return detectCategoriesFromLegacy({ specialties: input.specialties, title: input.title });
}

// W17 (moved from dialogue-recommendations so PURE modules can share it):
// dialogue topic → practitioner categories used to match humans to a theme.
// Lets a "money" question surface a financial coach, not the top-reviewed
// tarot reader.
export const TOPIC_CATEGORIES: Record<DialogueTopic, CategoryId[]> = {
  relationships: ["psychology", "esoteric"],
  family: ["psychology", "legal"],
  career: ["coaching", "psychology"],
  money: ["finance", "coaching"],
  anxiety: ["psychology"],
  self: ["psychology", "coaching", "esoteric"],
  other: ["psychology"],
};
