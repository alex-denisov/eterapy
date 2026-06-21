import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

export interface DialoguePrimaryAnswerResult {
  text: string;
  source: "ai";
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

// Issue #3: the «первичный разбор» is ALWAYS produced by the LLM. When the
// single active provider can't answer (after same-provider multi-model retries
// inside aiComplete), we throw this so the API surfaces an honest retry instead
// of falling back to a scripted/heuristic answer with no relation to the
// question. The UI already has a «Попробовать ещё раз» affordance.
export class DialoguePrimaryAnswerUnavailableError extends Error {
  constructor(message = "Primary answer LLM unavailable") {
    super(message);
    this.name = "DialoguePrimaryAnswerUnavailableError";
  }
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

export async function generateDialoguePrimaryAnswer(input: {
  topic?: string | null;
  difficulty?: string | null;
  safetyLevel?: string | null;
  messages: DialoguePrimaryAnswerMessage[];
  userId?: string | null;
  requestId?: string;
}): Promise<DialoguePrimaryAnswerResult> {
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
            "Ты пишешь бесплатный «первичный разбор» ETerapy после короткого уточняющего диалога.",
            "Пиши по-русски. Тепло, конкретно, по-человечески — обращайся ИМЕННО к ситуации этого человека, отзеркаливай его собственные слова и детали, которыми он поделился. Никаких общих, обезличенных формулировок.",
            "Структура — короткие разделы: «Короткий ответ», «Что кажется важным», «Мягкий следующий шаг». В каждом разделе несколько живых предложений (а не одна холодная строка) — будь содержательным.",
            "Начни «Короткий ответ» с того, что ты реально услышал в вопросе и уточнениях, чтобы было очевидно: разбор про его случай, а не шаблон.",
            "НЕ рекомендуй платные продукты, форматы, услуги, специалистов и не добавляй раздел «Если хочется глубже» — рекомендации показываются отдельным блоком после ответа.",
            "НЕ добавляй дисклеймеры и оговорки вида «это не медицинская/юридическая/финансовая рекомендация» — стандартный дисклеймер показывает интерфейс.",
            "Не продавливай, не дави, не ставь диагнозов, не обещай гарантированный исход, не манипулируй и не стыди.",
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
    // Too short to be a real разбор → treat as a provider miss and let the
    // caller retry, rather than persisting a one-line placeholder.
    if (text.length < 120) {
      log.warn("dialogue-primary-answer-too-short", {
        requestId: input.requestId,
        length: text.length,
        provider: response.provider,
        model: response.model,
      });
      throw new DialoguePrimaryAnswerUnavailableError("Primary answer too short");
    }

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
    if (error instanceof DialoguePrimaryAnswerUnavailableError) throw error;
    log.warn("dialogue-primary-answer-unavailable", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    throw new DialoguePrimaryAnswerUnavailableError();
  }
}
