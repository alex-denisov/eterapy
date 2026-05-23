import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const CHAT_SCREENSHOT_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export type ToneEntry = { label: string; pct: number };
export type ReplyVariant = { style: string; text: string };

export type ChatAnalysisStructured = {
  insight: string;
  tonesThem: ToneEntry[];
  tonesMe: ToneEntry[];
  replies: ReplyVariant[];
  safetyNote: string;
};

export function tryParseChatAnalysis(text: string): ChatAnalysisStructured | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<ChatAnalysisStructured>;
    if (!raw.insight || !Array.isArray(raw.replies)) return null;
    return raw as ChatAnalysisStructured;
  } catch {
    return null;
  }
}

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

export function heuristicChatAnalysis(sourceText: string): { text: string; metadata: Prisma.InputJsonObject } {
  const structured: ChatAnalysisStructured = {
    insight: "В этой переписке просматривается знакомый сценарий: попытка близости упирается в защитную реакцию — и оба собеседника остаются с ощущением, что их не слышат.",
    tonesThem: [
      { label: "защитный", pct: 72 },
      { label: "отстранённый", pct: 48 },
      { label: "обесценивающий", pct: 35 },
      { label: "тёплый", pct: 15 },
    ],
    tonesMe: [
      { label: "ищущий", pct: 65 },
      { label: "тревожный", pct: 52 },
      { label: "обиженный", pct: 40 },
      { label: "усталый", pct: 28 },
    ],
    replies: [
      { style: "мягкий", text: "«Слушай, я не хочу спорить. Просто скажи: с тобой сейчас можно поговорить, или это плохой момент?»" },
      { style: "прямой", text: "«Я замечаю, что разговор уходит в обвинения с обеих сторон. Можем сделать паузу и вернуться вечером?»" },
      { style: "границы", text: "«Когда я говорю, что мне важно, и слышу «не накручивай» — мне очень одиноко. Я не хочу так больше»." },
    ],
    safetyNote: "Если в переписке есть угрозы, давление, унижение или физическая опасность — это уже не тема для разбора, а тема для специалиста.",
  };
  return { text: JSON.stringify(structured), metadata: { source: "heuristic", sourceLength: sourceText.length } };
}

export async function generateChatAnalysis(input: {
  sourceText: string;
  contextNote?: string | null;
  userId: string;
  requestId?: string;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicChatAnalysis(input.sourceText);

  const systemPrompt = [
    "You are ETerapy. Analyze the chat conversation in Russian.",
    "Return ONLY valid JSON — no markdown, no code fences — with this exact structure:",
    '{"insight":"one meaningful insight sentence","tonesThem":[{"label":"...","pct":78},{"label":"...","pct":42},{"label":"...","pct":31},{"label":"...","pct":12}],"tonesMe":[{"label":"...","pct":56},{"label":"...","pct":48},{"label":"...","pct":44},{"label":"...","pct":30}],"replies":[{"style":"мягкий","text":"..."},{"style":"прямой","text":"..."},{"style":"границы","text":"..."}],"safetyNote":"..."}',
    "Rules: tonesThem and tonesMe each have exactly 4 items with realistic percentages summing to roughly 200%.",
    "replies has exactly 3 items. insight is one sentence. Be warm, non-diagnostic, non-fatalistic. No markdown inside string values.",
    "Do not state the other person's intent as fact. Never state psychological diagnoses as facts. Never label anyone as narcissist or manipulator as fact.",
  ].join(" ");

  try {
    const response = await aiComplete({
      feature: "product-chat-analysis",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1500,
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            input.contextNote ? `Context from user before analysis:\n${normalize(input.contextNote).slice(0, 1200)}` : "",
            "Chat log to analyze:",
            normalize(input.sourceText.slice(0, 8000)),
          ].filter(Boolean).join("\n\n"),
        },
      ],
    });

    const parsed = tryParseChatAnalysis(response.text.trim());
    if (!parsed) {
      return { text: fallback.text, metadata: { source: "heuristic", fallbackReason: "json_parse_failed" } };
    }
    return {
      text: JSON.stringify(parsed),
      metadata: {
        source: "ai",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
        contextNoteIncluded: Boolean(input.contextNote),
      },
    };
  } catch (error) {
    log.warn("chat-analysis-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return { text: fallback.text, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}
