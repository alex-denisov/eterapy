import { approvedLibraryEntries } from "@/data/anonymous-library";
import { libraryMetaDescription, libraryMetaTitle } from "@/lib/library-editorial";
import { LIFE_LIBRARY_TOPICS } from "@/lib/library-cta";

const PERSONAL_TOKENS = new Set([
  "я", "мы", "мне", "меня", "мой", "моя", "мои", "моего", "моей", "мной", "сама", "сам",
]);

const HUMAN_CONTEXT_STEMS = [
  "партн", "человек", "родител", "реб", "друг", "подруг", "семь", "коллег", "мам", "брат", "близк",
];

const FIRST_PERSON_STEMS = [
  "хочу", "работаю", "откладываю", "ненавижу", "обещаю", "бросаю", "довожу", "согласилась", "злюсь",
  "просыпаюсь", "проверяю", "жду", "переехала", "чувствую", "учусь", "думаю", "боюсь", "не знаю",
  "не могу", "хочется", "успеваю", "делаю", "живу", "сравниваю", "проигрываю", "осталась", "поделиться",
];

const TENSION_STEMS = [
  "бою", "страш", "тревог", "труд", "устал", "одинок", "не могу", "не понимаю", "не знаю",
  "не хочу", "не увер", "не справ", "не хватает", "не получается", "плохо", "потер", "ссор",
  "обид", "ревн", "паник", "винов", "муч", "сомнев", "пуст", "позд", "злю", "меша", "измен",
  "отдал", "перестал", "накры", "предател", "развод", "расстал", "останусь", "не принима",
  "почему", "хотя", "поруг", "конфликт", "недостат", "беспоко", "ипохонд", "жале", "срыва",
  "не слуш", "стран", "отдаю больше", "игнорир", "манипуля", "случит", "откладыв", "ненавиж",
  "броса", "пользу", "заверш", "завист", "одна", "лишн", "не поговор", "ошиб", "разрыва", "проигрыва",
  "умерш", "послание", "противополож", "завис", "негатив", "не так", "разные", "правильн", "чему верить",
  "ограничива", "не узнаю", "не работает",
];

const STOP_WORDS = new Set([
  "что", "как", "это", "или", "уже", "когда", "почему", "стоит", "просто", "очень", "снова",
  "постоянно", "понимаю", "хочу", "кажется", "вроде", "который", "которая", "которые", "после",
  "перед", "между", "себя", "свою", "свои", "свой", "сама", "сам",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function contentTokens(text: string): Set<string> {
  return new Set(tokens(text).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection);
}

describe("B550 — human editorial quality gate for life questions", () => {
  const entries = approvedLibraryEntries();

  it("keeps every question substantial, personal and emotionally consequential", () => {
    for (const entry of entries) {
      const questionTokens = tokens(entry.question);
      const lower = entry.question.toLowerCase();
      const hasPersonalVoice = questionTokens.some((token) => PERSONAL_TOKENS.has(token))
        || HUMAN_CONTEXT_STEMS.some((stem) => lower.includes(stem))
        || FIRST_PERSON_STEMS.some((stem) => lower.includes(stem));
      const hasTension = TENSION_STEMS.some((stem) => lower.includes(stem))
        || lower.includes(" но ")
        || lower.includes(" а ");

      expect(questionTokens.length).toBeGreaterThanOrEqual(8);
      expect(entry.question.length).toBeGreaterThanOrEqual(35);
      expect(entry.summary.length).toBeGreaterThanOrEqual(90);
      expect(hasPersonalVoice).toBe(true);
      expect(hasTension).toBe(true);
      expect(entry.question).not.toMatch(/^(что такое|значение|рассчитать|онлайн бесплатно|узнать онлайн)/iu);
    }
  });

  it("uses recognisable life categories instead of generic SEO buckets", () => {
    expect(LIFE_LIBRARY_TOPICS).toEqual([
      "Отношения",
      "Повторяется одно и то же",
      "Тревога и состояние",
      "Работа и деньги",
      "Одиночество",
      "Выбор и решения",
      "Про себя",
    ]);
    for (const topic of LIFE_LIBRARY_TOPICS) {
      expect(entries.filter((entry) => entry.topic === topic).length).toBeGreaterThanOrEqual(10);
    }
  });

  it("does not publish near-duplicate questions", () => {
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const similarity = jaccard(
          contentTokens(entries[leftIndex].question),
          contentTokens(entries[rightIndex].question),
        );
        expect({
          similarity,
          left: entries[leftIndex].question,
          right: entries[rightIndex].question,
        }).toEqual(expect.objectContaining({ similarity: expect.any(Number) }));
        expect(similarity).toBeLessThan(0.65);
      }
    }
  });

  it("gives every page a unique search title and a bounded description", () => {
    const titles = entries.map(libraryMetaTitle);
    expect(new Set(titles).size).toBe(titles.length);
    for (const entry of entries) {
      expect(libraryMetaTitle(entry).length).toBeLessThanOrEqual(65);
      expect(libraryMetaDescription(entry).length).toBeLessThanOrEqual(158);
    }
  });
});
