/**
 * B741 — ГЕЙТ УНИКАЛЬНОСТИ. ПОСЛЕДНЯЯ ПРЕГРАДА ПЕРЕД ВЫПУСКОМ.
 *
 * Требование владельца 2026-09-12: «надо быть уверенным что страницы содержат
 * уникальный текст». Уверенность здесь не может опираться на редактора: модель
 * не помнит корпус и физически не способна заметить, что абзац почти дословно
 * повторяет страницу, вышедшую три недели назад.
 *
 * ⚠ ПОЧЕМУ ЭТО ВАЖНЕЕ, ЧЕМ КАЖЕТСЯ. Автор пишет по шаблону промта, на смежные
 * запросы одного кластера, и у него на входе список уже вышедших заголовков —
 * но не их текст. Две страницы про «он не пишет первым» и «он перестал писать»
 * сойдутся сами собой, без злого умысла. Именно так набирается профиль фермы
 * шаблонов, за который Яндекс снял корпус 2026-08-17: там тоже никто не
 * копировал — просто 199 страниц собирались одной машиной по одной форме.
 *
 * МЕРА — CONTAINMENT, А НЕ JACCARD. Вопрос у нас несимметричный: «сколько
 * НОВОГО текста уже было», а не «насколько два текста похожи». Короткая новая
 * страница против длинной старой даст низкий Jaccard, даже если она целиком в
 * ней содержится. Containment (|A∩B| / |A|) отвечает ровно на наш вопрос.
 *
 * ШИНГЛЫ ПО ПЯТЬ СЛОВ. Меньше — и совпадать начнут обычные обороты русского
 * языка («в этой ситуации важно понять»); больше — и перестановка одного слова
 * спрячет заимствование.
 */

import { createHash } from "node:crypto";

/** Длина шингла в словах. */
export const SHINGLE_SIZE = 5;

/**
 * Доля совпадающих шинглов, выше которой текст считается несамостоятельным.
 *
 * ⚠ ЧИСЛО ВЫБРАНО С ЗАПАСОМ В СТОРОНУ ПРОПУСКА, А НЕ ОТКАЗА. Два честных
 * материала одной темы дают пересечение в единицы процентов: общими остаются
 * только устойчивые обороты. Двадцать процентов пятисловных последовательностей
 * — это уже не совпадение языка, это один и тот же текст другими словами.
 * Порог ниже начал бы браковать нормальные материалы кластера, а брак здесь
 * стоит дороже пропуска: страница, забракованная зря, не будет написана вовсе.
 */
export const MAX_CONTAINMENT = 0.2;

/**
 * Порог самоповтора ВНУТРИ одной страницы.
 *
 * Отдельный и более мягкий: разделы одного материала законно перекликаются,
 * а вот абзац, повторённый дословно в двух разделах, — это уже вода, которой
 * добирали объём до рубежа глубины.
 */
export const MAX_SELF_REPEAT = 0.12;

const TOKEN_SEPARATOR = /[^\p{L}\p{N}]+/u;

export function normalizeWords(text: string): string[] {
  return text
    .toLocaleLowerCase("ru-RU")
    .split(TOKEN_SEPARATOR)
    .filter((word) => word.length > 0);
}

/**
 * Множество шинглов текста.
 *
 * Хранятся хэшами, а не строками: корпус — это сотни страниц по сотне шинглов,
 * и держать их полными строками значило бы таскать мегабайты ради сравнения,
 * которому нужна только одинаковость.
 */
export function shingleSet(text: string, size = SHINGLE_SIZE): Set<string> {
  const words = normalizeWords(text);
  const shingles = new Set<string>();
  if (words.length < size) return shingles;
  for (let index = 0; index + size <= words.length; index += 1) {
    const gram = words.slice(index, index + size).join(" ");
    shingles.add(createHash("sha1").update(gram).digest("base64").slice(0, 12));
  }
  return shingles;
}

/** Доля шинглов `candidate`, встречающихся в `corpus`. */
export function containment(candidate: ReadonlySet<string>, corpus: ReadonlySet<string>): number {
  if (candidate.size === 0) return 0;
  let hits = 0;
  for (const shingle of candidate) {
    if (corpus.has(shingle)) hits += 1;
  }
  return hits / candidate.size;
}

/**
 * Насколько текст повторяет сам себя.
 *
 * Считается как доля шинглов, встретившихся больше одного раза. Множество
 * шинглов схлопывает повторы, поэтому здесь нужен именно счёт по вхождениям.
 */
export function selfRepeatRatio(text: string, size = SHINGLE_SIZE): number {
  const words = normalizeWords(text);
  if (words.length < size * 2) return 0;
  const seen = new Map<string, number>();
  let total = 0;
  for (let index = 0; index + size <= words.length; index += 1) {
    const gram = words.slice(index, index + size).join(" ");
    seen.set(gram, (seen.get(gram) ?? 0) + 1);
    total += 1;
  }
  let repeated = 0;
  for (const count of seen.values()) {
    if (count > 1) repeated += count - 1;
  }
  return total === 0 ? 0 : repeated / total;
}

export interface UniquenessVerdict {
  unique: boolean;
  /** Наибольшее пересечение и с чем именно. */
  worstContainment: number;
  worstAgainst: string | null;
  selfRepeat: number;
  reason: string | null;
}

/** Одна запись корпуса для сверки. */
export interface CorpusEntry {
  slug: string;
  shingles: Set<string>;
}

/**
 * Индекс корпуса. Строится ОДИН раз на проход агента.
 *
 * Наивная реализация резала бы корпус на шинглы заново для каждой проверки, а
 * это двести текстов по пятьсот слов на каждую страницу. Сегодня это заметно,
 * а на корпусе в тысячу страниц заход агента встал бы на секунды.
 */
export function buildCorpusIndex(entries: ReadonlyArray<{ slug: string; text: string }>): CorpusEntry[] {
  return entries
    .map((entry) => ({ slug: entry.slug, shingles: shingleSet(entry.text) }))
    .filter((entry) => entry.shingles.size > 0);
}

/**
 * Вердикт по кандидату.
 *
 * `excludeSlug` нужен для дописывания: материал, которому дописывают тело,
 * законно содержит собственный вопрос и собственный короткий ответ, и сверять
 * его с самим собой значило бы браковать всякое дописывание.
 */
export function checkUniqueness(input: {
  text: string;
  corpus: readonly CorpusEntry[];
  excludeSlug?: string | null;
  maxContainment?: number;
}): UniquenessVerdict {
  const limit = input.maxContainment ?? MAX_CONTAINMENT;
  const candidate = shingleSet(input.text);
  const selfRepeat = selfRepeatRatio(input.text);

  let worstContainment = 0;
  let worstAgainst: string | null = null;
  for (const entry of input.corpus) {
    if (input.excludeSlug && entry.slug === input.excludeSlug) continue;
    const score = containment(candidate, entry.shingles);
    if (score > worstContainment) {
      worstContainment = score;
      worstAgainst = entry.slug;
    }
  }

  if (candidate.size === 0) {
    return {
      unique: false,
      worstContainment: 0,
      worstAgainst: null,
      selfRepeat,
      reason: "текст короче одного шингла — сравнивать нечего",
    };
  }
  if (worstContainment >= limit) {
    return {
      unique: false,
      worstContainment,
      worstAgainst,
      selfRepeat,
      reason: `${Math.round(worstContainment * 100)}% пятисловных фрагментов уже есть на странице «${worstAgainst}»`,
    };
  }
  if (selfRepeat >= MAX_SELF_REPEAT) {
    return {
      unique: false,
      worstContainment,
      worstAgainst,
      selfRepeat,
      reason: `${Math.round(selfRepeat * 100)}% фрагментов повторяются внутри самой страницы — это вода, а не объём`,
    };
  }
  return { unique: true, worstContainment, worstAgainst, selfRepeat, reason: null };
}
