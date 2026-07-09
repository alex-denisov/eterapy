import { parseBirthDate } from "@/lib/esoteric-chart";

// B451: детерминированный числовой портрет (русская нумерология, пифагорейская
// редукция). Считаем РЕАЛЬНЫЕ ядровые числа — Число жизненного пути (по дате),
// Число выражения (по полному имени) и Число души (по гласным). Это твёрдые факты,
// на которые опирается экспертный разбор и визуализация — как знак Солнца у натальной.

// Русская нумерологическая таблица (буква → 1..9).
const RU_LETTER_VALUE: Record<string, number> = {
  а: 1, и: 1, с: 1, ъ: 1,
  б: 2, й: 2, т: 2, ы: 2,
  в: 3, к: 3, у: 3, ь: 3,
  г: 4, л: 4, ф: 4, э: 4,
  д: 5, м: 5, х: 5, ю: 5,
  е: 6, н: 6, ц: 6, я: 6,
  ё: 7, о: 7, ч: 7,
  ж: 8, п: 8, ш: 8,
  з: 9, р: 9, щ: 9,
};
const RU_VOWELS = new Set(["а", "е", "ё", "и", "о", "у", "ы", "э", "ю", "я"]);

// Редукция к 1–9 с сохранением мастер-чисел 11/22/33.
function reduceNumber(n: number): number {
  let value = n;
  while (value > 9 && value !== 11 && value !== 22 && value !== 33) {
    value = String(value).split("").reduce((sum, d) => sum + Number(d), 0);
  }
  return value;
}

function sumLetters(letters: string[]): number {
  return letters.reduce((sum, ch) => sum + (RU_LETTER_VALUE[ch] ?? 0), 0);
}

export type NumerologyPortrait = {
  lifePath: number;
  expression: number | null;
  soulUrge: number | null;
  name: string | null;
  birth: { day: number; month: number; year: number | null } | null;
  hasYear: boolean;
};

// Имя берём из строки «Имя: …», иначе из ведущего фрагмента кириллицы до даты.
function extractName(input: string): string | null {
  const tagged = input.match(/Имя:\s*(.+)/)?.[1]?.trim();
  if (tagged) return tagged;
  const lead = input.split(/\d/)[0]?.replace(/[^\p{L}\s-]/gu, " ").trim();
  return lead && lead.length > 1 ? lead : null;
}

export function computeNumerology(input: string): NumerologyPortrait {
  const name = extractName(input);
  const parsed = parseBirthDate(input);
  const hasYear = typeof parsed.year === "number";

  const dateDigits = hasYear
    ? `${String(parsed.day).padStart(2, "0")}${String(parsed.month).padStart(2, "0")}${parsed.year}`
    : `${String(parsed.day).padStart(2, "0")}${String(parsed.month).padStart(2, "0")}`;
  const lifePath = reduceNumber(dateDigits.split("").reduce((sum, d) => sum + Number(d), 0));

  let expression: number | null = null;
  let soulUrge: number | null = null;
  if (name) {
    const letters = [...name.toLowerCase()].filter((ch) => RU_LETTER_VALUE[ch] !== undefined);
    if (letters.length > 0) {
      expression = reduceNumber(sumLetters(letters));
      const vowels = letters.filter((ch) => RU_VOWELS.has(ch));
      if (vowels.length > 0) soulUrge = reduceNumber(sumLetters(vowels));
    }
  }

  return {
    lifePath,
    expression,
    soulUrge,
    name,
    birth: { day: parsed.day, month: parsed.month, year: parsed.year },
    hasYear,
  };
}

// Короткие ярлыки чисел для подписей/фактов (бережные, без фатальности).
export const NUMBER_KEYWORD: Record<number, string> = {
  1: "лидерство и начало",
  2: "чуткость и союз",
  3: "выражение и радость",
  4: "опора и порядок",
  5: "свобода и перемены",
  6: "забота и ответственность",
  7: "глубина и смысл",
  8: "масштаб и результат",
  9: "сострадание и завершение",
  11: "интуиция и вдохновение",
  22: "мастер-строитель",
  33: "забота-учительство",
};

export function numerologyFactsForAI(p: NumerologyPortrait): string {
  return [
    "ТОЧНО ПОСЧИТАНО (пифагорейская редукция — не меняй эти числа):",
    `Число жизненного пути: ${p.lifePath} (${NUMBER_KEYWORD[p.lifePath] ?? "—"}).`,
    p.expression !== null ? `Число выражения (по имени): ${p.expression} (${NUMBER_KEYWORD[p.expression] ?? "—"}).` : "Имя не передано — Число выражения не считаем, не выдумывай его.",
    p.soulUrge !== null ? `Число души (по гласным имени): ${p.soulUrge} (${NUMBER_KEYWORD[p.soulUrge] ?? "—"}).` : "",
    p.hasYear ? "" : "Год рождения не указан — Число жизненного пути приблизительно; мягко предложи указать полную дату.",
    "Опирайся именно на эти числа. Заголовки разделов, карта чисел и интерпретация обязаны совпадать: не называй в тексте другие числа и не подменяй их примерами. Если объясняешь альтернативные школы, делай это отдельно и коротко, не меняя расчет этого результата.",
  ].filter(Boolean).join("\n");
}
