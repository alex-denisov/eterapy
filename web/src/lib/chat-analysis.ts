import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const CHAT_SCREENSHOT_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export type ToneEntry = { label: string; pct: number };
// INC-022: `text` is the literal, ready-to-send message the user copies AS-IS.
// `hint` is an optional short recommendation (когда/зачем) shown OUTSIDE the
// copyable text — recommendations must never leak into `text`.
export type ReplyVariant = { style: string; text: string; hint?: string };

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

// INC-021: the «первый взгляд» preview is an ASSESSMENT, not a reprint of the
// conversation. Never echo the source transcript here — only what the analysis
// concluded. (Used only as a fallback; the real preview is the teaser below.)
export function buildChatAnalysisPreview(_sourceText: string) {
  return [
    "Полный разбор покажет:",
    "- 1. Обзор ситуации и контекст",
    "- 2. Вероятные сценарии (без фатальности)",
    "- 3. Риски в коммуникации",
    "- 4. Рекомендации по ответам",
    "- 5. План действий",
  ].join("\n");
}

// INC-021: assessment-only teaser. The block must contain ONLY the first-look
// оценка (один инсайт + тон собеседника) — never the recognised transcript.
export function buildChatAnalysisTeaser(sourceText: string, generatedText: string) {
  const parsed = tryParseChatAnalysis(generatedText) ?? tryParseChatAnalysis(heuristicChatAnalysis(sourceText).text);
  const topTone = parsed?.tonesThem?.[0];
  return [
    `Один инсайт: ${parsed?.insight ?? "в переписке уже виден повторяющийся сценарий контакта и защиты."}`,
    topTone ? `Тон собеседника: ${topTone.label}${typeof topTone.pct === "number" ? ` (${topTone.pct}%)` : ""}.` : "",
    "",
    "В полном разборе откроются ваш тон, варианты ответа и безопасный следующий шаг.",
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

export function combineRecognizedChatTexts(fragments: string[]) {
  return fragments
    .map((fragment) => cleanOcrText(fragment))
    .filter(Boolean)
    .join("\n\n")
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
      { style: "мягкий", text: "Слушай, я не хочу спорить. Просто скажи: с тобой сейчас можно поговорить, или это плохой момент?", hint: "Если хочется снизить напряжение и оставить дверь открытой." },
      { style: "прямой", text: "Я замечаю, что разговор уходит в обвинения с обеих сторон. Можем сделать паузу и вернуться вечером?", hint: "Если разговор по кругу и нужна честная пауза." },
      { style: "границы", text: "Когда я говорю, что мне важно, и слышу «не накручивай» — мне очень одиноко. Я так больше не хочу.", hint: "Если важно обозначить, что так общаться для вас неприемлемо." },
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

  // B320: emphasize relationship context. Without this the model defaulted
  // to romantic-partner framing even when the user selected "начальник" or
  // "коллега" and wrote a workplace-themed goal, because heated chat logs
  // bias the prior. The context block is now MANDATORY framing for the
  // analysis rather than a soft hint.
  const systemPrompt = [
    "You are ETerapy. Analyze the chat conversation in Russian.",
    "CRITICAL: the user provides a CONTEXT block describing (1) who the other person is in their life (партнёр, бывший(ая), родитель, друг, коллега, начальник, другой), (2) their current feeling, and (3) what they want from the analysis.",
    "You MUST respect the relationship label literally. If the context says начальник or коллега, this is a WORKPLACE conversation — do NOT frame it as a romantic or family conflict. If the context says родитель, frame it as parent-child dynamics. If партнёр or бывший(ая), frame it as romantic.",
    "If the user's goal is stated, the insight, tone analysis, and reply variants must all align with that goal.",
    "Return ONLY valid JSON — no markdown, no code fences — with this exact structure:",
    '{"insight":"one meaningful insight sentence","tonesThem":[{"label":"...","pct":78},{"label":"...","pct":42},{"label":"...","pct":31},{"label":"...","pct":12}],"tonesMe":[{"label":"...","pct":56},{"label":"...","pct":48},{"label":"...","pct":44},{"label":"...","pct":30}],"replies":[{"style":"мягкий","text":"...","hint":"..."},{"style":"прямой","text":"...","hint":"..."},{"style":"границы","text":"...","hint":"..."}],"safetyNote":"..."}',
    "Rules: tonesThem and tonesMe each have exactly 4 items with realistic percentages summing to roughly 200%.",
    "replies has exactly 3 items. insight is one sentence. Be warm, non-diagnostic, non-fatalistic. No markdown inside string values.",
    // INC-022: replies[].text must be a COPY-READY message, not advice.
    "CRITICAL — replies[].text MUST be the literal message the user can copy and send AS-IS to the other person. Write it in first person («я…»), addressed directly to собеседник, in the user's natural everyday voice, in Russian. It is the reply itself, NOT advice about replying. NEVER put meta-commentary inside text — no «Похоже, что…», «возможно, стоит…», «попробуйте…», «дайте ему время», «рекомендую…», no third-person description of the situation. Do NOT wrap text in quotes («»).",
    "replies[].hint is a SHORT note FOR THE USER (≤90 chars, Russian) — когда/зачем выбрать этот вариант. Every recommendation, suggestion or situational comment belongs ONLY in hint, never in text.",
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
          // B320: place CONTEXT before the chat log and label it explicitly so
          // the model treats it as the framing rather than background hint.
          content: [
            input.contextNote
              ? `CONTEXT (must shape the entire analysis):\n${normalize(input.contextNote).slice(0, 1200)}`
              : "CONTEXT: no explicit context provided — infer cautiously and avoid assuming romantic framing.",
            "Chat log to analyze:",
            normalize(input.sourceText.slice(0, 8000)),
          ].join("\n\n"),
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
