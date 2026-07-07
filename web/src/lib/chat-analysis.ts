import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { aiComplete } from "@/lib/ai";
import { CHAT_ANALYSIS_SYSTEM_PROMPT } from "@/lib/chat-analysis-prompt";
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
  // Issue #6: «главное» was a single cold sentence. `assessment` is the fuller
  // read the client actually came for — a direct, warm answer to their question
  // plus the platform's evaluation of the situation (2–4 живых предложения, may
  // span two short paragraphs). Optional for backward-compat with разборы saved
  // before this field existed.
  assessment?: string;
  tonesThem: ToneEntry[];
  tonesMe: ToneEntry[];
  uncertainZones?: string[];
  conflictPoints?: string[];
  replies: ReplyVariant[];
  dontSend?: string[];
  safetyNote: string;
};

export function tryParseChatAnalysis(text: string): ChatAnalysisStructured | null {
  if (!text) return null;
  // INC-024: tolerate JSON wrapped in ```fences``` or surrounded by prose. Try the
  // raw text first, then the substring from the first «{» to the last «}». This
  // keeps a valid LLM answer from being thrown away (→ static heuristic fallback)
  // just because the model added a code fence or a stray sentence.
  for (const candidate of chatAnalysisJsonCandidates(text)) {
    try {
      const raw = JSON.parse(candidate) as Partial<ChatAnalysisStructured>;
      if (raw.insight && Array.isArray(raw.replies)) return raw as ChatAnalysisStructured;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function chatAnalysisJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const sliced = trimmed.slice(start, end + 1);
    if (sliced !== trimmed) candidates.push(sliced);
  }
  return candidates;
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

// INC-021 + INC-023: the «первый взгляд» preview is the first-look insight ONLY —
// never the recognised transcript (INC-021), and without the «Один инсайт:» label
// or the собеседник tone (INC-023). Tone is reserved for the final разбор.
export function buildChatAnalysisTeaser(sourceText: string, generatedText: string) {
  const parsed = tryParseChatAnalysis(generatedText) ?? tryParseChatAnalysis(heuristicChatAnalysis(sourceText).text);
  return [
    parsed?.insight ?? "В переписке уже виден повторяющийся сценарий контакта и защиты.",
    "",
    "В полном разборе откроются тон собеседника, ваш тон, варианты ответа и безопасный следующий шаг.",
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
    assessment: [
      "Судя по переписке, вы тянетесь к контакту и хотите быть услышанным, а в ответ получаете защиту и отстранение — и каждый виток разговора только укрепляет это кольцо. Дело не в том, что один из вас «неправ»: вы говорите из разных состояний, поэтому слова бьют мимо.",
      "Это значит, что спорить по содержанию почти бесполезно — сначала нужно снизить напряжение и обозначить, что для вас важно, без обвинения. Тогда у собеседника появляется шанс выйти из обороны, а у вас — перестать платить за разговор тревогой.",
    ].join("\n\n"),
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
  const systemPrompt = CHAT_ANALYSIS_SYSTEM_PROMPT;

  try {
    const response = await aiComplete({
      feature: "product-chat-analysis",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 2000,
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
