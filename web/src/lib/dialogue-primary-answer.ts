import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

export interface DialoguePrimaryAnswerResult {
  text: string;
  source: "ai" | "heuristic";
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
}

export interface DialoguePrimaryAnswerMessage {
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
}

function compactMessages(messages: DialoguePrimaryAnswerMessage[]) {
  return messages
    .filter((message) => message.role !== "SYSTEM")
    .map((message) => `${message.role === "USER" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n")
    .slice(0, 8000);
}

function normalizeAnswer(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

function depthRecommendation(topic?: string | null) {
  if (topic === "relationships") {
    return "Если захочется глубже, лучше всего подойдет «4 ракурса ответа»: он разделит факты, чувства, символический смысл и мягкое действие без давления на решение.";
  }
  if (topic === "career") {
    return "Если захочется глубже, начните с «4 ракурсов ответа»: там можно отдельно увидеть разумные варианты, внутреннюю реакцию и маленький рабочий шаг.";
  }
  if (topic === "anxiety") {
    return "Если захочется глубже, подойдет «Глубокий отчёт»: он поможет спокойно отделить факты от тревожных предположений и собрать опоры.";
  }
  if (topic === "money") {
    return "Если захочется глубже, лучше выбрать «Глубокий отчёт»: он даст структуру для вариантов и рисков, но не заменяет финансового специалиста.";
  }
  return "Если захочется глубже, начните с «4 ракурсов ответа»: это самый мягкий следующий слой после бесплатного разбора.";
}

export function heuristicPrimaryAnswer(input: {
  topic?: string | null;
  difficulty?: string | null;
  messages: DialoguePrimaryAnswerMessage[];
}): DialoguePrimaryAnswerResult {
  const firstUserMessage = input.messages.find((message) => message.role === "USER")?.content ?? "ваш вопрос";
  const lastUserMessage = [...input.messages].reverse().find((message) => message.role === "USER")?.content;
  const contextLine = lastUserMessage && lastUserMessage !== firstUserMessage
    ? `С учетом вашего уточнения: ${lastUserMessage}`
    : `Ваш вопрос: ${firstUserMessage}`;
  const topicHint =
    input.topic === "relationships" ? "в отношениях сейчас важнее смотреть на повторяющийся сценарий, а не только на один эпизод" :
    input.topic === "career" ? "в выборе направления сейчас полезно сравнить не только выгоду, но и устойчивость" :
    input.topic === "money" ? "в финансовой теме лучше отделить тревогу от конкретного следующего решения" :
    input.topic === "family" ? "в семейной теме стоит отделить свои границы от ожиданий других людей" :
    input.topic === "anxiety" ? "при тревоге особенно важны мягкий темп и опора на факты настоящего момента" :
    "здесь полезно начать с самого живого вопроса, а не пытаться решить все сразу";

  return {
    source: "heuristic",
    text: normalizeAnswer([
      "Короткий ответ",
      `${contextLine}. По текущему контексту видно, что ${topicHint}.`,
      "",
      "Что кажется важным",
      "Не пытайтесь сразу найти окончательный знак или единственно правильный вариант. Сначала отметьте, где в ситуации больше спокойствия, ясности и уважения к вашим границам.",
      "",
      "Мягкий следующий шаг",
      "Запишите два варианта развития событий и рядом с каждым: что вы получаете, что теряете, и какой маленький шаг можно сделать без резкого решения.",
      "",
      "Если хочется глубже",
      depthRecommendation(input.topic),
      "",
      "Важно: это не медицинская, юридическая или финансовая рекомендация. Если в ситуации есть риск для безопасности, здоровья или денег, подключите профильного специалиста.",
    ].join("\n")),
  };
}

export async function generateDialoguePrimaryAnswer(input: {
  topic?: string | null;
  difficulty?: string | null;
  safetyLevel?: string | null;
  messages: DialoguePrimaryAnswerMessage[];
  userId?: string | null;
  requestId?: string;
}): Promise<DialoguePrimaryAnswerResult> {
  const fallback = heuristicPrimaryAnswer(input);

  try {
    const response = await aiComplete({
      feature: "dialogue-primary-answer",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 900,
      temperature: 0.55,
      messages: [
        {
          role: "system",
          content: [
            "You write ETerapy's free primary answer after clarifying questions.",
            "Write in Russian. Be warm, specific, and concise.",
            "Use short sections: Короткий ответ, Что кажется важным, Мягкий следующий шаг, Если хочется глубже.",
            "In «Если хочется глубже», recommend one relevant ETerapy deepening as an optional next layer: 4 ракурса ответа, Глубокий отчёт, Разбор переписки, Совместимость, or 7 дней к ясности.",
            "Do not hard-sell, pressure, diagnose, predict guaranteed outcomes, manipulate, or shame.",
            "For medical, legal, financial, emergency, or safety topics, include safe redirect copy.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic=${input.topic ?? "unknown"}`,
            `difficulty=${input.difficulty ?? "unknown"}`,
            `safety=${input.safetyLevel ?? "unknown"}`,
            "conversation:",
            compactMessages(input.messages),
          ].join("\n"),
        },
      ],
    });

    const text = normalizeAnswer(response.text);
    if (text.length < 120) return fallback;

    return {
      text,
      source: "ai",
      provider: response.provider,
      model: response.model,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      latencyMs: response.latencyMs,
    };
  } catch (error) {
    log.warn("dialogue-primary-answer-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return fallback;
  }
}
