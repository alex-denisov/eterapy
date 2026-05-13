import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const CHAT_SCREENSHOT_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/;

export class ChatAnalysisInputError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ChatAnalysisInputError";
    this.code = code;
  }
}

export function maskChatAnalysisPii(sourceText: string) {
  return sourceText
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email скрыт]")
    .replace(/(?:\+?\d[\s().-]*){10,}/g, "[телефон скрыт]")
    .replace(/\bhttps?:\/\/[^\s<>"')]+/gi, "[ссылка скрыта]")
    .replace(/(^|\s)@[a-zA-Z0-9_]{3,32}\b/g, "$1[ник скрыт]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildChatAnalysisTitle(sourceText: string) {
  return `Разбор переписки: ${sourceText.slice(0, 30).replace(/\n/g, " ")}...`;
}

export function buildChatAnalysisPreview(sourceText: string) {
  const anonymized = sourceText
    .split("\n")
    .slice(0, 5)
    .map(line => {
      // Very basic heuristic for preview only.
      // E.g., replace leading names: "Анна: привет" -> "Собеседник: привет"
      // or "Я: привет" stays "Я: привет".
      const parts = line.split(":");
      if (parts.length > 1 && parts[0].length < 15) {
        if (parts[0].toLowerCase().trim() === "я") return line;
        return `Собеседник: ${parts.slice(1).join(":").trim()}`;
      }
      return line;
    })
    .join("\n");

  return [
    anonymized,
    sourceText.split("\n").length > 5 ? "..." : "",
    "",
    "Полный разбор покажет:",
    "- 1. Обзор ситуации и контекст",
    "- 2. Вероятные сценарии (без фатальности)",
    "- 3. Риски в коммуникации",
    "- 4. Рекомендации по ответам",
    "- 5. План действий",
  ].filter(Boolean).join("\n");
}

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 9000);
}

export function validateChatScreenshotDataUrl(imageDataUrl: string) {
  const match = CHAT_SCREENSHOT_DATA_URL.exec(imageDataUrl.trim());
  if (!match) {
    throw new ChatAnalysisInputError("UNSUPPORTED_IMAGE", "Загрузите PNG, JPG или WebP скриншот переписки");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length < 512) {
    throw new ChatAnalysisInputError("IMAGE_TOO_SMALL", "Скриншот слишком маленький для распознавания");
  }
  if (buffer.length > MAX_SCREENSHOT_BYTES) {
    throw new ChatAnalysisInputError("IMAGE_TOO_LARGE", "Скриншот должен быть меньше 4 МБ");
  }

  return {
    mimeType: match[1],
    byteLength: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function cleanOcrText(text: string) {
  return text
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 10000);
}

export async function extractChatTextFromScreenshot(input: {
  imageDataUrl: string;
  userId: string;
  requestId?: string;
}): Promise<{
  recognizedText: string;
  metadata: Prisma.InputJsonObject;
}> {
  const screenshot = validateChatScreenshotDataUrl(input.imageDataUrl);

  try {
    const response = await aiComplete({
      feature: "product-chat-analysis-ocr",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1600,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Extract chat text from a screenshot for ETerapy.",
            "Return only the recognized conversation text, preserving message order and speaker labels when visible.",
            "Do not analyze the conversation. Do not infer hidden content. If text is unreadable, return an empty string.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Recognize the chat messages in this screenshot. Output plain text only." },
            { type: "image_url", image_url: { url: input.imageDataUrl } },
          ],
        },
      ],
    });

    const recognizedText = cleanOcrText(response.text);
    if (recognizedText.length < 10) {
      throw new ChatAnalysisInputError("OCR_TEXT_TOO_SHORT", "Не удалось распознать достаточно текста. Попробуйте другой скриншот или вставьте текст вручную");
    }

    return {
      recognizedText,
      metadata: {
        ocrSource: "ai_vision",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
        screenshot: {
          mimeType: screenshot.mimeType,
          byteLength: screenshot.byteLength,
          sha256: screenshot.sha256,
          stored: false,
        },
      },
    };
  } catch (error) {
    if (error instanceof ChatAnalysisInputError) throw error;
    log.warn("chat-analysis-ocr-failed", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    throw new ChatAnalysisInputError("OCR_FAILED", "Не удалось распознать скриншот. Попробуйте другой файл или вставьте текст вручную");
  }
}

export function heuristicChatAnalysis(sourceText: string) {
  const excerpt = sourceText.slice(0, 220).replace(/\s+/g, " ").trim();
  return normalize([
    "Разбор переписки",
    "",
    "1. Обзор ситуации",
    "В представленном фрагменте видна нехватка прозрачности и попытка добиться ясности. Кто-то из собеседников ожидает конкретики, в то время как другой избегает прямого ответа.",
    excerpt ? `Опорный фрагмент: ${excerpt}` : "",
    "",
    "2. Сценарии",
    "Если коммуникация продолжится в том же ключе, напряжение будет расти. Если один из вас возьмет паузу и переведет разговор в формат 'я-сообщений', шансы на конструктив увеличатся.",
    "",
    "3. Риски",
    "Основной риск — скатиться во взаимные обвинения вместо решения реальной проблемы.",
    "",
    "4. Рекомендации",
    "Постарайтесь не додумывать за собеседника. Задайте прямой вопрос о его намерениях без упрека.",
    "",
    "5. План действий",
    "Сделайте паузу. Подумайте, что именно вам сейчас важно получить от этого диалога, и сформулируйте это в одном спокойном сообщении.",
  ].join("\n"));
}

export async function generateChatAnalysis(input: {
  sourceText: string;
  userId: string;
  requestId?: string;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicChatAnalysis(input.sourceText);

  try {
    const response = await aiComplete({
      feature: "product-chat-analysis",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1500,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Write ETerapy's paid Chat Analysis result in Russian.",
            "Use exactly these sections: 1. Обзор, 2. Сценарии, 3. Риски, 4. Рекомендации, 5. План действий.",
            "Do not make definitive medical or psychological diagnoses. Do not be fatalistic. Be objective and supportive.",
            "Do not state the other person's intent as fact. Do not label anyone as narcissist or manipulator as fact.",
            "Do not advise abrupt breakup as the only answer. Recommend privacy-safe, consent-aware next steps.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            "Chat log to analyze:",
            input.sourceText.slice(0, 8000),
          ].join("\n"),
        },
      ],
    });

    const text = normalize(response.text);
    if (text.length < 300) {
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
    log.warn("chat-analysis-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}
