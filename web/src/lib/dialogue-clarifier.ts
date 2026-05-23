import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

export interface DialogueClarifyingQuestionsResult {
  questions: string[];
  chips: string[][];
  source: "ai" | "heuristic";
  provider?: string;
  model?: string;
}

const MIN_QUESTIONS = 2;
const MAX_QUESTIONS = 5;

function normalizeQuestion(value: unknown) {
  if (typeof value !== "string") return null;
  const question = value.replace(/\s+/g, " ").trim();
  if (question.length < 8) return null;
  return question.slice(0, 220);
}

function normalizeChip(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const chip = value.replace(/\s+/g, " ").trim();
  if (chip.length < 2 || chip.length > 60) return null;
  return chip;
}

function normalizeChips(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const chips: string[] = [];
  for (const item of value) {
    const chip = normalizeChip(item);
    if (chip) chips.push(chip);
    if (chips.length >= 4) break;
  }
  return chips;
}

function uniqueQuestions(values: unknown[]) {
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const value of values) {
    const question = normalizeQuestion(value);
    if (!question) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(question);
    if (questions.length >= MAX_QUESTIONS) break;
  }
  return questions;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed;
  }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  return arrayMatch?.[0] ?? null;
}

export function parseClarifyingQuestionsResponse(text: string): { questions: string[]; chips: string[][] } | null {
  const json = extractJson(text);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    const rawQuestions = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { questions?: unknown }).questions)
        ? (parsed as { questions: unknown[] }).questions
        : [];
    const questions = uniqueQuestions(rawQuestions);
    if (questions.length < MIN_QUESTIONS) return null;

    const rawChips = Array.isArray((parsed as { chips?: unknown }).chips)
      ? (parsed as { chips: unknown[] }).chips
      : [];
    const chips = questions.map((_, i) => normalizeChips(rawChips[i]));
    return { questions, chips };
  } catch {
    return null;
  }
}

export function heuristicClarifyingQuestions(_input: {
  question: string;
  topic?: string | null;
  difficulty?: string | null;
}): DialogueClarifyingQuestionsResult {
  return {
    questions: [
      "Что сейчас самое важное для вас в этом вопросе?",
      "Что вы уже пробовали или рассматривали?",
      "Какой результат или ощущение вы хотели бы получить?",
    ],
    chips: [
      ["Ясность", "Поддержка", "Действие"],
      ["Ничего ещё", "Думал, но не пробовал", "Пробовал разное"],
      ["Понять себя", "Принять решение", "Двигаться дальше"],
    ],
    source: "heuristic",
  };
}

export async function generateDialogueClarifyingQuestions(input: {
  question: string;
  topic?: string | null;
  difficulty?: string | null;
  safetyLevel?: string | null;
  userId?: string | null;
  requestId?: string;
}): Promise<DialogueClarifyingQuestionsResult> {
  const fallback = heuristicClarifyingQuestions(input);

  try {
    const response = await aiComplete({
      feature: "dialogue_clarifier",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 600,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "You create clarifying questions for ETerapy before the primary answer.",
            "Return only JSON: {\"questions\":[...],\"chips\":[[...],[...],[...]]} — 2 to 5 questions with exactly 3 short chips (1–6 words) per question.",
            "Chips are concrete, distinct answer options in Russian the user can tap to quickly respond to that specific question.",
            "Questions must be gentle, concrete, non-diagnostic, and useful for an esoteric self-reflection product.",
            "Do not answer the user's question. Do not include crisis, medical, legal, or financial advice.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic=${input.topic ?? "unknown"}`,
            `difficulty=${input.difficulty ?? "unknown"}`,
            `safety=${input.safetyLevel ?? "unknown"}`,
            `question=${input.question}`,
          ].join("\n"),
        },
      ],
    });

    const parsed = parseClarifyingQuestionsResponse(response.text);
    if (!parsed) return fallback;

    return {
      questions: parsed.questions,
      chips: parsed.chips,
      source: "ai",
      provider: response.provider,
      model: response.model,
    };
  } catch (error) {
    log.warn("dialogue-clarifier-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return fallback;
  }
}
