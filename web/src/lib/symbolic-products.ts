import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import { buildNatalWheel } from "@/lib/esoteric-chart";
import { log, serializeError } from "@/lib/logger";

export const SYMBOLIC_PRODUCT_DEFINITIONS = [
  {
    productKey: "tarot",
    title: "Расклад Таро",
    promptLabel: "Вопрос для расклада",
    resultTitle: "Символический расклад Таро",
  },
  {
    productKey: "natal-chart",
    title: "Натальная карта",
    promptLabel: "Дата, время и место рождения",
    resultTitle: "Натальная карта как язык тем",
  },
  {
    productKey: "numerology",
    title: "Числовой портрет",
    promptLabel: "Имя и дата рождения",
    resultTitle: "Числовой портрет",
  },
  {
    productKey: "my-map",
    title: "Расширенная карта",
    promptLabel: "Что собрать в карту",
    resultTitle: "Расширенная карта ETerapy",
  },
] as const;

export type SymbolicProductKey = (typeof SYMBOLIC_PRODUCT_DEFINITIONS)[number]["productKey"];

export function isSymbolicProductKey(value: string): value is SymbolicProductKey {
  return SYMBOLIC_PRODUCT_DEFINITIONS.some((definition) => definition.productKey === value);
}

export function getSymbolicProductDefinition(productKey: string) {
  return SYMBOLIC_PRODUCT_DEFINITIONS.find((definition) => definition.productKey === productKey) ?? null;
}

// #12: a real Таро spread. The result (and its visual on the page) must reflect
// actual drawn cards, not a hardcoded marketing example. We draw 3 Major Arcana
// for Прошлое / Настоящее / Будущее deterministically from the question, so the
// same reading is stable across re-renders and matches the interpretation.
export type TarotCard = { position: string; name: string; meaning: string; reversed: boolean };

const TAROT_MAJOR_ARCANA: Array<{ name: string; meaning: string }> = [
  { name: "Шут", meaning: "новое начало, доверие пути" },
  { name: "Маг", meaning: "воля и ресурсы уже под рукой" },
  { name: "Верховная Жрица", meaning: "интуиция, тихое знание" },
  { name: "Императрица", meaning: "забота, рост, плодородие" },
  { name: "Император", meaning: "опора, структура, границы" },
  { name: "Иерофант", meaning: "опыт, традиция, наставник" },
  { name: "Влюблённые", meaning: "выбор сердца и ценностей" },
  { name: "Колесница", meaning: "движение к цели, собранность" },
  { name: "Сила", meaning: "мягкая стойкость" },
  { name: "Отшельник", meaning: "пауза, поиск ответа внутри" },
  { name: "Колесо Фортуны", meaning: "перемена, новый цикл" },
  { name: "Справедливость", meaning: "честность и последствия" },
  { name: "Повешенный", meaning: "смена угла зрения" },
  { name: "Смерть", meaning: "завершение и переход" },
  { name: "Умеренность", meaning: "баланс и мера" },
  { name: "Дьявол", meaning: "привязанность, что держит" },
  { name: "Башня", meaning: "слом иллюзии, освобождение" },
  { name: "Звезда", meaning: "надежда и восстановление" },
  { name: "Луна", meaning: "туман, тревога, образы" },
  { name: "Солнце", meaning: "свет, тепло, радость" },
  { name: "Суд", meaning: "пробуждение, честный итог" },
  { name: "Мир", meaning: "целостность, завершение круга" },
];

const TAROT_POSITIONS = ["Прошлое", "Настоящее", "Будущее"] as const;

function seededHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function drawTarotSpread(seed: string): TarotCard[] {
  let state = seededHash(seed) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
  const deck = TAROT_MAJOR_ARCANA.map((card) => ({ ...card }));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return TAROT_POSITIONS.map((position, idx) => ({
    position,
    name: deck[idx].name,
    meaning: deck[idx].meaning,
    reversed: next() < 0.28,
  }));
}

function tarotReadingFromCards(cards: TarotCard[], userInput: string): string {
  const intro = userInput.trim()
    ? `Расклад на ваш вопрос: «${userInput.trim().slice(0, 160)}».`
    : "Расклад на вашу ситуацию.";
  const lines = cards.map((card) => {
    const orientation = card.reversed ? " (перевёрнутая)" : "";
    return `## ${card.position}: ${card.name}${orientation}\n${card.reversed ? "Энергия карты приглушена или обращена внутрь: " : ""}${card.meaning}. Что из этого откликается в вашей ситуации прямо сейчас?`;
  });
  return [
    intro,
    ...lines,
    "## Бережный следующий шаг\nВыберите одну карту, которая зацепила сильнее всего, и сделайте один маленький шаг в её сторону на этой неделе.",
  ].join("\n\n");
}

export function buildSymbolicProductTeaser(input: {
  productKey: SymbolicProductKey;
  userInput: string;
  generatedText: string;
}) {
  const generatedLines = input.generatedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const firstMeaningfulLine = generatedLines.find((line) => !/^расклад|натальная карта|числовой портрет|расширенная карта/i.test(line))
    ?? generatedLines[0]
    ?? "В вашем запросе уже видна одна тема, которую можно рассмотреть бережно и без фатальных обещаний.";

  if (input.productKey === "tarot") {
    return [
      "Первая карта",
      firstMeaningfulLine,
      "",
      "Полный расклад откроет остальные карты и общий синтез.",
    ].join("\n");
  }

  if (input.productKey === "natal-chart") {
    return [
      "Один акцент натальной карты",
      firstMeaningfulLine,
      "",
      "Полный разбор раскроет дополнительные темы и практический маршрут.",
    ].join("\n");
  }

  if (input.productKey === "numerology") {
    const yearLine = generatedLines.find((line) => /число года/i.test(line)) ?? firstMeaningfulLine;
    const strengthLine = generatedLines.find((line) => /сильная сторона/i.test(line)) ?? "Сильная сторона: замечать повторяющийся ритм и выбирать следующий шаг спокойнее.";
    return [
      yearLine,
      strengthLine,
      "",
      "Полный портрет откроет остальные числа и рекомендации.",
    ].join("\n");
  }

  const repeatedTheme = extractRepeatedTheme(input.userInput);
  return [
    "Повторяющаяся тема",
    repeatedTheme
      ? `В вашей истории чаще всего звучит тема: ${repeatedTheme}.`
      : firstMeaningfulLine,
    "",
    "Полная карта соберет годовую динамику, ослабшие темы и следующий шаг.",
  ].join("\n");
}

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

function extractRepeatedTheme(text: string) {
  const stopWords = new Set(["хочу", "темы", "года", "отношения", "работа", "сейчас", "этой", "этот", "если", "мне", "что"]);
  const counts = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !stopWords.has(word))
    .reduce<Map<string, number>>((acc, word) => {
      acc.set(word, (acc.get(word) ?? 0) + 1);
      return acc;
    }, new Map());

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function heuristicSymbolicResult(input: { productKey: SymbolicProductKey; userInput: string }) {
  if (input.productKey === "tarot") {
    return [
      "Расклад Таро",
      "",
      "Прошлое — Жрица. Похоже, часть ответа вы уже слышали внутри, но пока не дали ей языка.",
      "Настоящее — Башня. Сейчас рушится не вся ситуация, а прежний способ держаться за неё.",
      "Возможное — Звезда. Самый бережный путь начинается с паузы и одного честного вопроса к себе.",
      "",
      "Практический шаг: запишите, что в этой ситуации является фактом, а что — образом страха. Карты не решают за вас; они помогают увидеть развилку.",
    ].join("\n");
  }
  if (input.productKey === "natal-chart") {
    return [
      "Натальная карта",
      "",
      "Этот разбор стоит читать как карту тем, а не как сценарий судьбы. В фокусе — где вам легче начинать, где нужна опора, и какой язык поддержки подходит именно вам.",
      "",
      "Акцент вопроса: сейчас важно не искать «правильный знак», а заметить, какую часть себя вы пытаетесь обойти ради внешнего спокойствия.",
    ].join("\n");
  }
  if (input.productKey === "numerology") {
    return [
      "Числовой портрет",
      "",
      "Числа здесь работают как короткий язык повторов. Один слой показывает, где вам нужна свобода движения, другой — где вы ищете тишину и смысл.",
      "",
      "Практический вопрос: где вы сейчас тратите силы против собственного ритма, а где энергия появляется почти сама?",
    ].join("\n");
  }
  return [
    "Расширенная карта ETerapy",
    "",
    "Карта собирает повторяющиеся темы в один годовой портрет: что стало тише, что окрепло, какие фразы возвращаются чаще всего.",
    "",
    "Центральный сюжет: учиться занимать место без чувства вины. Следующий шаг — выбрать одну тему, которую вы больше не хотите решать в одиночку.",
  ].join("\n");
}

export async function generateSymbolicProductResult(input: {
  productKey: SymbolicProductKey;
  userInput: string;
  userId: string;
  requestId?: string;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const definition = getSymbolicProductDefinition(input.productKey);
  // #12: tarot draws a real 3-card spread; cards are stored in metadata so the
  // page can render the actual cards, and the AI interprets exactly these cards.
  const cards = input.productKey === "tarot"
    ? drawTarotSpread(`${input.userId}:${normalize(input.userInput)}`)
    : null;
  // B388: натальная карта получает детерминированное структурное колесо в metadata,
  // чтобы страница услуги и PDF рендерили визуал, совпадающий с интерпретацией.
  const wheel = input.productKey === "natal-chart" ? buildNatalWheel(normalize(input.userInput)) : null;
  const visualMeta: Prisma.InputJsonObject = {
    ...(cards ? { cards: cards as unknown as Prisma.InputJsonValue } : {}),
    ...(wheel ? { wheel: wheel as unknown as Prisma.InputJsonValue } : {}),
  };
  const cardsMeta = visualMeta;
  const fallback = cards ? tarotReadingFromCards(cards, input.userInput) : heuristicSymbolicResult(input);

  try {
    // B362/Механика 7: каждый символический продукт должен использовать СВОЙ
    // промт (product-tarot / product-natal-chart / product-numerology / product-my-map),
    // а не один общий. Берём промт продукта из конфигурации промтов — тот же,
    // что виден и редактируется суперадмином в /admin/ai (DB-override применяется
    // дальше в applyAIPromptOverride). Раньше здесь был общий хардкод → все
    // символические продукты выходили «одинаковыми» и админ-промты не работали.
    const feature = `product-${input.productKey}`;
    const baseSystemPrompt = defaultPromptTextForFeature(feature);
    const tarotCardsNote = cards
      ? "\n\nЭто расклad из 3 карт (Прошлое/Настоящее/Будущее). Интерпретируй ИМЕННО выпавшие карты ниже, по одной секции на карту, в контексте вопроса."
      : "";

    const response = await aiComplete({
      feature,
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1400,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: baseSystemPrompt + tarotCardsNote,
        },
        {
          role: "user",
          content: [
            `Product: ${definition?.title ?? input.productKey}`,
            cards ? `Выпавшие карты: ${cards.map((c) => `${c.position} — ${c.name}${c.reversed ? " (перевёрнутая)" : ""}`).join("; ")}.` : "",
            `User input: ${normalize(input.userInput) || "Пользователь хочет бережный символический разбор."}`,
          ].filter(Boolean).join("\n"),
        },
      ],
    });

    const text = normalize(response.text);
    if (text.length < 220) {
      return { text: fallback, metadata: { source: "heuristic", fallbackReason: "short_ai_response", ...cardsMeta } };
    }

    return {
      text,
      metadata: {
        source: "ai",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
        ...cardsMeta,
      },
    };
  } catch (error) {
    log.warn("symbolic-product-fallback", {
      requestId: input.requestId,
      productKey: input.productKey,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error", ...cardsMeta } };
  }
}
