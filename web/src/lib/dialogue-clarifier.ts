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

const HEURISTIC_CHIPS: Record<string, string[]> = {
  "Что в этой ситуации для вас сейчас самое важное прояснить?": ["Острая, прямо сейчас", "Накопилось", "Сложно сказать"],
  "Какой исход вы считаете для себя самым спокойным и честным?": ["Когда прояснится", "Когда смогу решить", "Пока не знаю"],
  "Какая динамика между вами повторяется чаще всего?": ["Избегание", "Напряжение", "Непонимание"],
  "Какой выбор или рабочий сценарий сейчас вызывает больше всего напряжения?": ["Сменить работу", "Конфликт", "Нет роста"],
  "Какое финансовое решение вы боитесь принять или отложить?": ["Большие расходы", "Смена дохода", "Долги"],
  "Чьи ожидания сильнее всего влияют на ваше решение?": ["Родители", "Партнёр", "Дети"],
  "В какой момент тревога становится заметнее всего?": ["Ночью", "Перед важным", "Постоянно"],
  "Что вы уже пробовали, чтобы лучше понять себя в этом вопросе?": ["Разговор с близким", "Читал / смотрел", "Ничего пока"],
  "Какой контекст может сильнее всего изменить ответ на ваш вопрос?": ["Отношения", "Работа или деньги", "Здоровье"],
  "Есть ли срочность, риск или ограничение, которое важно учитывать сразу?": ["Да, срочно", "Есть риски", "Нет пока"],
  "Что будет хорошим первым маленьким шагом после ответа?": ["Поговорить с кем-то", "Сделать один шаг", "Подумать ещё"],
};

const DEFAULT_CHIPS = ["Острая, прямо сейчас", "Накопилось", "Сложно сказать"];

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

  const questions = uniqueQuestions([...base, topicQuestion, difficultyQuestion]);
  return {
    questions,
    chips: questions.map((q) => HEURISTIC_CHIPS[q] ?? DEFAULT_CHIPS),
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
