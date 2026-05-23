import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
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

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
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
  const fallback = heuristicSymbolicResult(input);
  const definition = getSymbolicProductDefinition(input.productKey);

  try {
    const response = await aiComplete({
      feature: "product-symbolic",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1400,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Write a paid ETerapy symbolic product result in Russian.",
            "Be warm, concrete, non-fatalistic and ethical.",
            "Do not predict the future as fact. Do not diagnose. Do not give medical, legal or financial instructions.",
            "Use short sections and always end with one practical next step.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Product: ${definition?.title ?? input.productKey}`,
            `User input: ${normalize(input.userInput) || "Пользователь хочет бережный символический разбор."}`,
          ].join("\n"),
        },
      ],
    });

    const text = normalize(response.text);
    if (text.length < 220) {
      return { text: fallback, metadata: { source: "heuristic", fallbackReason: "short_ai_response" } };
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
      },
    };
  } catch (error) {
    log.warn("symbolic-product-fallback", {
      requestId: input.requestId,
      productKey: input.productKey,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}
