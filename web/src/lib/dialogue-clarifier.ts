import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

export interface DialogueClarifyingQuestionsResult {
  questions: string[];
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

export function parseClarifyingQuestionsResponse(text: string) {
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
    return questions.length >= MIN_QUESTIONS ? questions : null;
  } catch {
    return null;
  }
}

export function heuristicClarifyingQuestions(input: {
  question: string;
  topic?: string | null;
  difficulty?: string | null;
}): DialogueClarifyingQuestionsResult {
  const topic = input.topic ?? "other";
  const base = [
    "Что в этой ситуации для вас сейчас самое важное прояснить?",
    "Какой исход вы считаете для себя самым спокойным и честным?",
  ];
  const topicQuestion =
    topic === "relationships" ? "Какая динамика между вами повторяется чаще всего?" :
    topic === "career" ? "Какой выбор или рабочий сценарий сейчас вызывает больше всего напряжения?" :
    topic === "money" ? "Какое финансовое решение вы боитесь принять или отложить?" :
    topic === "family" ? "Чьи ожидания сильнее всего влияют на ваше решение?" :
    topic === "anxiety" ? "В какой момент тревога становится заметнее всего?" :
    topic === "self" ? "Что вы уже пробовали, чтобы лучше понять себя в этом вопросе?" :
    "Какой контекст может сильнее всего изменить ответ на ваш вопрос?";
  const difficultyQuestion = input.difficulty === "high"
    ? "Есть ли срочность, риск или ограничение, которое важно учитывать сразу?"
    : "Что будет хорошим первым маленьким шагом после ответа?";

  return {
    questions: uniqueQuestions([...base, topicQuestion, difficultyQuestion]),
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
      maxTokens: 320,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "You create clarifying questions for ETerapy before the primary answer.",
            "Return only JSON: {\"questions\":[...]} with 2 to 5 short questions.",
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

    const questions = parseClarifyingQuestionsResponse(response.text);
    if (!questions) return fallback;

    return {
      questions,
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
