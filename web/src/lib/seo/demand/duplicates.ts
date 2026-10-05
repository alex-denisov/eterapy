/**
 * B750 — ОДНА СТРАНИЦА НА НАМЕРЕНИЕ.
 *
 * «как быстро принять решение» и «как принять нужное решение» — один запрос с
 * одной выдачей. Две страницы под них конкурируют друг с другом, и ни одна не
 * поднимается. Ключ темы — множество основ значимых слов без наполнителей;
 * близость — Жаккар по основам.
 *
 * Чистые функции, без ввода-вывода.
 */

export const NEAR_DUPLICATE_THRESHOLD = 0.6;

/** Слова, не несущие темы: вопросительная рамка, оценки, «бесплатно онлайн». */
const FILLER = new Set([
  "как", "можно", "быстро", "нужное", "нужный", "наилучшее", "хорошие", "хорошее", "какое", "какой", "то", "бесплатно",
  "онлайн", "расшифровкой", "расшифровка", "расшифровки", "значение", "значения", "и", "что", "делать", "в", "на", "по",
  "с", "со", "для", "правильное", "правильно", "важное", "верное", "самостоятельное", "самостоятельно", "самой", "самому",
  "лучше", "после", "того", "жизни", "если", "это", "о", "об", "от", "ли", "а", "к", "у", "же", "не", "мне", "мой", "моя",
  "рассчитать", "расчет", "узнать", "правильный", "другие", "любое", "любые", "первое", "рациональное", "рационально",
  "грамотно", "легко", "сам", "самим",
]);

/** Грубое схлопывание форм одного корня после усечения до 5 букв. */
const STEM_ALIASES: Readonly<Record<string, string>> = {
  прини: "приня",
  выбра: "выбор",
  решит: "решен",
  реша: "решен",
};

function stemOf(token: string): string {
  const cut = token.slice(0, 5);
  return STEM_ALIASES[cut] ?? cut;
}

function tokens(phrase: string): string[] {
  return phrase
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function stemSet(phrase: string): Set<string> {
  return new Set(
    tokens(phrase)
      .filter((token) => !FILLER.has(token))
      .map(stemOf),
  );
}

/** Нормализованный ключ темы: основы значимых слов по алфавиту. */
export function topicKey(phrase: string): string {
  return [...stemSet(phrase)].sort().join(" ");
}

export function nearDuplicate(a: string, b: string): boolean {
  const left = stemSet(a);
  const right = stemSet(b);
  if (left.size === 0 || right.size === 0) {
    return tokens(a).join(" ") === tokens(b).join(" ");
  }
  let common = 0;
  for (const stem of left) if (right.has(stem)) common += 1;
  const union = left.size + right.size - common;
  return common / union >= NEAR_DUPLICATE_THRESHOLD;
}

/** Первая фраза из `existing`, дублирующая `phrase` по теме, либо `null`. */
export function duplicateOf(phrase: string, existing: Iterable<string>): string | null {
  for (const other of existing) {
    if (nearDuplicate(phrase, other)) return other;
  }
  return null;
}
