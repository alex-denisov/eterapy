import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

export const DIALOGUE_TOPICS = [
  "relationships",
  "career",
  "money",
  "family",
  "self",
  "anxiety",
  "other",
] as const;

export const DIALOGUE_DIFFICULTIES = [
  "low",
  "medium",
  "high",
] as const;

export type DialogueTopic = typeof DIALOGUE_TOPICS[number];
export type DialogueDifficulty = typeof DIALOGUE_DIFFICULTIES[number];

export interface DialogueRoutingResult {
  topic: DialogueTopic;
  difficulty: DialogueDifficulty;
  confidence: number;
  source: "ai" | "heuristic";
  provider?: string;
  model?: string;
}

const TOPIC_SET = new Set<string>(DIALOGUE_TOPICS);
const DIFFICULTY_SET = new Set<string>(DIALOGUE_DIFFICULTIES);

function clampConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeTopic(value: unknown): DialogueTopic {
  if (typeof value === "string" && TOPIC_SET.has(value)) return value as DialogueTopic;
  return "other";
}

function normalizeDifficulty(value: unknown): DialogueDifficulty {
  if (typeof value === "string" && DIFFICULTY_SET.has(value)) return value as DialogueDifficulty;
  return "medium";
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}

export function parseDialogueRoutingResponse(text: string): Omit<DialogueRoutingResult, "source" | "provider" | "model"> | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      topic: normalizeTopic(parsed.topic),
      difficulty: normalizeDifficulty(parsed.difficulty),
      confidence: clampConfidence(parsed.confidence),
    };
  } catch {
    return null;
  }
}

export function heuristicDialogueRoute(question: string): DialogueRoutingResult {
  const text = question.toLowerCase();
  const topic: DialogueTopic =
    /отнош|любов|партнер|партнёр|муж|жена|бывш|relationship|partner/.test(text) ? "relationships" :
    /работ|карьер|профес|бизнес|job|career|work/.test(text) ? "career" :
    /деньг|финанс|кредит|доход|money|finance|debt/.test(text) ? "money" :
    /семь|родител|дет|мам|пап|family|child|parent/.test(text) ? "family" :
    /трево|страх|паник|anxiety|fear|panic/.test(text) ? "anxiety" :
    /себ|самооцен|путь|смысл|self|meaning|identity/.test(text) ? "self" :
    "other";

  const hasCrisisMarkers = /суицид|умереть|убить себя|самоповреж|насили|panic|suicide|violence/.test(text);
  const hasMultiLayerMarkers = /постоянно|снова|повторя|несколько лет|треугольник|развод|увол|долг|always|again|years/.test(text);
  const difficulty: DialogueDifficulty = hasCrisisMarkers ? "high" : hasMultiLayerMarkers ? "medium" : "low";

  return {
    topic,
    difficulty,
    confidence: topic === "other" ? 0.35 : 0.55,
    source: "heuristic",
  };
}

export async function classifyDialogueQuestion(input: {
  question: string;
  userId?: string | null;
  requestId?: string;
}): Promise<DialogueRoutingResult> {
  const fallback = heuristicDialogueRoute(input.question);

  try {
    const response = await aiComplete({
      feature: "dialogue-router",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 140,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Classify an ETerapy user question.",
            "Return only JSON with keys: topic, difficulty, confidence.",
            `topic must be one of: ${DIALOGUE_TOPICS.join(", ")}.`,
            `difficulty must be one of: ${DIALOGUE_DIFFICULTIES.join(", ")}.`,
            "Do not answer the user question.",
          ].join(" "),
        },
        {
          role: "user",
          content: input.question,
        },
      ],
    });

    const parsed = parseDialogueRoutingResponse(response.text);
    if (!parsed) return fallback;

    return {
      ...parsed,
      source: "ai",
      provider: response.provider,
      model: response.model,
    };
  } catch (error) {
    log.warn("dialogue-router-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return fallback;
  }
}
