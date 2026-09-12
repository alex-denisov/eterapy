/**
 * B740 — ДЕТЕРМИНИРОВАННЫЙ ГЕЙТ СТРАНИЦЫ.
 *
 * ⚠ ПОЧЕМУ ЭТО НЕ РАБОТА РЕДАКТОРА. Всё, что можно посчитать, обязано считаться
 * кодом: длина title, объём текста, число разделов, наличие запроса в
 * заголовке. Урок B705 прямой — роль, которой поручили считать, тратит на счёт
 * вывод, за который мы платим, и всё равно считает хуже. Редактор судит то,
 * что посчитать нельзя: отвечено ли, честно ли, живо ли.
 *
 * Гейт делит нарушения на ДВА РОДА, и это не педантизм:
 *   blocking — страница с этим не выпускается никогда (объём ниже рубежа
 *     индексируемости, нет запроса в заголовке, пустое тело);
 *   advisory — редактор увидит это в machineFindings и решит сам (title на
 *     два символа длиннее нормы — не повод жечь ещё один раунд).
 */

import { LIBRARY_MIN_OWN_FAQS, LIBRARY_MIN_OWN_WORDS, countWords } from "@/lib/library-depth";
import { SEO_PAGE_TARGET_WORDS_MAX } from "@/lib/seo/page-prompt";

export interface SeoPageDraft {
  question: string;
  metaTitle: string;
  metaDescription: string;
  summary: string;
  body: Array<{ heading: string; paragraphs: string[] }>;
  mainForkTitle: string;
  mainForkNote: string;
  perspectives: string[];
  faqs: Array<{ question: string; answer: string }>;
  firstStep: string;
}

/** Границы выдачи. Дальше поисковик обрезает — заголовок теряет конец. */
export const META_TITLE_MAX = 60;
export const META_TITLE_MIN = 25;
export const META_DESCRIPTION_MAX = 170;
export const META_DESCRIPTION_MIN = 110;
/** Сколько раз запрос может встречаться во всём тексте. Больше — переспам. */
export const QUERY_MAX_OCCURRENCES = 6;
export const BODY_MIN_SECTIONS = 3;

export interface GateViolation {
  kind: "blocking" | "advisory";
  message: string;
}

const TOKEN_SEPARATOR = /[^\p{L}\p{N}]+/u;

function tokens(value: string): string[] {
  return value.toLocaleLowerCase("ru-RU").split(TOKEN_SEPARATOR).filter(Boolean);
}

/**
 * Сводится ли словоформа к той же основе.
 *
 * `\b` в JS кириллицу не видит вовсе, поэтому сравнение идёт по токенам, а
 * словоформы сводятся отбрасыванием одного окончания — тот же приём, что в
 * `search-marketing-parsers.ts`. Иначе «не пишет» и «не пишут» считались бы
 * разными словами, и гейт требовал бы от автора дословной вставки запроса —
 * ровно того переспама, который он же и должен ловить.
 */
function stem(token: string): string {
  return token.length >= 5 ? token.slice(0, -1) : token;
}

/** Встречается ли запрос (с точностью до словоформ) в тексте. */
export function containsQuery(text: string, query: string): boolean {
  const queryStems = tokens(query).map(stem).filter((token) => token.length >= 3);
  if (queryStems.length === 0) return true;
  const textStems = new Set(tokens(text).map(stem));
  const hit = queryStems.filter((token) => textStems.has(token)).length;
  // Достаточно двух третей значимых слов запроса: требовать все — значит
  // требовать дословную вставку, а это и есть переспам.
  return hit >= Math.ceil((queryStems.length * 2) / 3);
}

/** Сколько раз запрос встречается целиком, подряд, без изменений. */
export function countExactOccurrences(text: string, query: string): number {
  const haystack = text.toLocaleLowerCase("ru-RU");
  const needle = query.toLocaleLowerCase("ru-RU").trim();
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Весь собственный текст страницы одной строкой. */
export function draftText(draft: SeoPageDraft): string {
  const parts = [draft.question, draft.summary, draft.mainForkTitle, draft.mainForkNote, draft.firstStep];
  for (const section of draft.body) parts.push(section.heading, ...section.paragraphs);
  for (const faq of draft.faqs) parts.push(faq.question, faq.answer);
  parts.push(...draft.perspectives);
  return parts.filter(Boolean).join("\n");
}

export function ownWordCount(draft: SeoPageDraft): number {
  return countWords(draftText(draft));
}

/**
 * Проверка черновика.
 *
 * Порядок сообщений — от того, что делает страницу бесполезной, к тому, что
 * делает её хуже. Редактор читает список сверху вниз.
 */
export function inspectSeoPageDraft(input: {
  draft: SeoPageDraft;
  targetQuery: string;
}): GateViolation[] {
  const { draft, targetQuery } = input;
  const violations: GateViolation[] = [];
  const words = ownWordCount(draft);
  const text = draftText(draft);

  if (words < LIBRARY_MIN_OWN_WORDS) {
    violations.push({
      kind: "blocking",
      message: `собственного текста ${words} слов при рубеже индексируемости ${LIBRARY_MIN_OWN_WORDS}`,
    });
  } else if (words > SEO_PAGE_TARGET_WORDS_MAX * 1.5) {
    violations.push({
      kind: "advisory",
      message: `${words} слов — заметно выше нормы ${SEO_PAGE_TARGET_WORDS_MAX}`,
    });
  }

  if (draft.body.length < BODY_MIN_SECTIONS) {
    violations.push({
      kind: "blocking",
      message: `разделов разбора ${draft.body.length} при минимуме ${BODY_MIN_SECTIONS}`,
    });
  }
  if (draft.faqs.length < LIBRARY_MIN_OWN_FAQS) {
    violations.push({
      kind: "blocking",
      message: `вопросов FAQ ${draft.faqs.length} при минимуме ${LIBRARY_MIN_OWN_FAQS}`,
    });
  }
  if (draft.perspectives.length < 2) {
    violations.push({
      kind: "blocking",
      message: `пунктов «что можно проверить» ${draft.perspectives.length} при минимуме 2`,
    });
  }

  if (!containsQuery(draft.question, targetQuery) && !containsQuery(draft.metaTitle, targetQuery)) {
    violations.push({
      kind: "blocking",
      message: `запрос «${targetQuery}» не встречается ни в H1, ни в title`,
    });
  }
  if (!containsQuery(draft.summary, targetQuery)) {
    violations.push({
      kind: "advisory",
      message: "запроса нет в первом абзаце — сниппет соберётся не из него",
    });
  }

  const occurrences = countExactOccurrences(text, targetQuery);
  if (occurrences > QUERY_MAX_OCCURRENCES) {
    violations.push({
      kind: "blocking",
      message: `запрос повторён дословно ${occurrences} раз при потолке ${QUERY_MAX_OCCURRENCES} — это переспам`,
    });
  }

  const titleLength = draft.metaTitle.trim().length;
  if (titleLength > META_TITLE_MAX) {
    violations.push({ kind: "advisory", message: `title ${titleLength} символов при пределе ${META_TITLE_MAX}` });
  }
  if (titleLength < META_TITLE_MIN) {
    violations.push({ kind: "advisory", message: `title ${titleLength} символов — короче осмысленного минимума` });
  }
  const descriptionLength = draft.metaDescription.trim().length;
  if (descriptionLength > META_DESCRIPTION_MAX || descriptionLength < META_DESCRIPTION_MIN) {
    violations.push({
      kind: "advisory",
      message: `description ${descriptionLength} символов вне окна ${META_DESCRIPTION_MIN}–${META_DESCRIPTION_MAX}`,
    });
  }

  // Разметка автора — признак того, что модель отдала не структуру, а текст
  // «под структуру». В шаблон это уедет как видимые звёздочки и решётки.
  if (/(^|\n)\s*#{1,6}\s|\*\*|```/.test(text)) {
    violations.push({ kind: "blocking", message: "в тексте осталась markdown-разметка" });
  }

  return violations;
}

export function blockingViolations(violations: readonly GateViolation[]): GateViolation[] {
  return violations.filter((violation) => violation.kind === "blocking");
}
