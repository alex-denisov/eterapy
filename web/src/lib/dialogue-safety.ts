import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

export const DIALOGUE_SAFETY_LEVELS = [
  "normal",
  "sensitive",
  "crisis",
  "blocked",
] as const;

export type DialogueSafetyLevel = typeof DIALOGUE_SAFETY_LEVELS[number];

export interface DialogueSafetyResult {
  level: DialogueSafetyLevel;
  reason: string;
  confidence: number;
  source: "ai" | "heuristic" | "conservative";
  provider?: string;
  model?: string;
}

const SAFETY_SET = new Set<string>(DIALOGUE_SAFETY_LEVELS);

function clampConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeLevel(value: unknown): DialogueSafetyLevel {
  if (typeof value === "string" && SAFETY_SET.has(value)) return value as DialogueSafetyLevel;
  return "sensitive";
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}

export function parseDialogueSafetyResponse(text: string): Omit<DialogueSafetyResult, "source" | "provider" | "model"> | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const reason = typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 160)
      : "classified";
    return {
      level: normalizeLevel(parsed.level),
      reason,
      confidence: clampConfidence(parsed.confidence),
    };
  } catch {
    return null;
  }
}

export function heuristicDialogueSafety(question: string): DialogueSafetyResult {
  const text = question.toLowerCase();
  if (/суицид|покончить с собой|убить себя|самоуб|самоповреж|self-harm|suicide/.test(text)) {
    return { level: "crisis", reason: "self_harm_or_suicide_marker", confidence: 0.82, source: "heuristic" };
  }
  if (/убить|насилие|избить|преслед|kill|violence|stalk/.test(text)) {
    return { level: "crisis", reason: "violence_or_immediate_harm_marker", confidence: 0.74, source: "heuristic" };
  }
  if (/диагноз|лекарств|суд|иск|налог|инвест|кредит|medical|legal|diagnosis|court|investment/.test(text)) {
    return { level: "sensitive", reason: "medical_legal_financial_marker", confidence: 0.66, source: "heuristic" };
  }
  if (/18\+|наркот|обмануть|взлом|fraud|hack|illegal/.test(text)) {
    return { level: "blocked", reason: "unsafe_or_disallowed_marker", confidence: 0.7, source: "heuristic" };
  }
  return { level: "normal", reason: "no_marker", confidence: 0.55, source: "heuristic" };
}

export function shouldInterruptDialogue(level: DialogueSafetyLevel) {
  return level === "crisis" || level === "blocked";
}

export async function classifyDialogueSafety(input: {
  question: string;
  userId?: string | null;
  requestId?: string;
}): Promise<DialogueSafetyResult> {
  const heuristic = heuristicDialogueSafety(input.question);

  try {
    const response = await aiComplete({
      // B362/Механика 7: feature key must match the prompt config key
      // ("safety-classification" with a hyphen) — normalizeAIFeatureKey keeps
      // underscores, so "safety_classification" never matched the admin prompt.
      feature: "safety-classification",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 140,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Classify ETerapy user safety risk.",
            "Return only JSON with keys: level, reason, confidence.",
            `level must be one of: ${DIALOGUE_SAFETY_LEVELS.join(", ")}.`,
            "Use crisis for self-harm, suicide, immediate violence, or emergency risk.",
            "Use sensitive for medical, legal, financial, or high-emotion non-emergency topics.",
            "Use blocked for requests to enable harm, abuse, fraud, or illegal actions.",
            "Do not answer the user question.",
          ].join(" "),
        },
        { role: "user", content: input.question },
      ],
    });

    const parsed = parseDialogueSafetyResponse(response.text);
    if (!parsed) return heuristic.level === "normal"
      ? { level: "sensitive", reason: "classifier_parse_failed", confidence: 0.5, source: "conservative" }
      : heuristic;

    return {
      ...parsed,
      source: "ai",
      provider: response.provider,
      model: response.model,
    };
  } catch (error) {
    log.warn("dialogue-safety-conservative-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return heuristic.level === "normal"
      ? { level: "sensitive", reason: "classifier_unavailable", confidence: 0.5, source: "conservative" }
      : heuristic;
  }
}
