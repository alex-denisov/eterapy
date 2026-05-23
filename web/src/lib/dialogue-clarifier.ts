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

export interface ConversationalTurnResult {
  type: "question" | "ready";
  question?: string;
  chips?: string[];
  source: "ai" | "heuristic";
  provider?: string;
  model?: string;
}

const MIN_CLARIFYING_TURNS = 3;
const MAX_CLARIFYING_TURNS = 5;

const HEURISTIC_QUESTION_POOL: Array<{ question: string; chips: string[] }> = [
  { question: "Что сейчас самое важное для вас в этом вопросе?", chips: ["Ясность", "Поддержка", "Действие"] },
  { question: "Что вы уже пробовали или рассматривали?", chips: ["Ничего ещё", "Думал, но не пробовал", "Пробовал разное"] },
  { question: "Что именно вас беспокоит больше всего в этой ситуации?", chips: ["Неопределённость", "Отношения", "Мои чувства"] },
  { question: "Какой исход для вас был бы самым спокойным?", chips: ["Сохранить как есть", "Что-то изменить", "Начать заново"] },
  { question: "Какой результат или ощущение вы хотели бы получить?", chips: ["Понять себя", "Принять решение", "Двигаться дальше"] },
];

function parseConversationalTurnResponse(text: string): ConversationalTurnResult | null {
  const json = extractJson(text);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    // Accept both short format {q, c} and legacy {type, question, chips}
    const q = typeof parsed.q === "string" ? parsed.q.trim()
      : typeof parsed.question === "string" ? parsed.question.trim()
      : null;
    // Empty q or explicit ready signal = model is done
    if (q === "" || parsed.type === "ready") return { type: "ready", source: "ai" };
    if (!q || q.length < 8) return null;
    const rawChips = Array.isArray(parsed.c) ? parsed.c
      : Array.isArray(parsed.chips) ? parsed.chips
      : [];
    const question = normalizeQuestion(q);
    if (!question) return null;
    return { type: "question", question, chips: normalizeChips(rawChips), source: "ai" };
  } catch {
    return null;
  }
}

export async function generateDialogueConversationalTurn(input: {
  originalQuestion: string;
  previousPairs: Array<{ question: string; answer: string }>;
  topic?: string | null;
  difficulty?: string | null;
  safetyLevel?: string | null;
  userId?: string | null;
  requestId?: string;
}): Promise<ConversationalTurnResult> {
  if (input.previousPairs.length >= MAX_CLARIFYING_TURNS) {
    return { type: "ready", source: "heuristic" };
  }

  const heuristicTurn = HEURISTIC_QUESTION_POOL[input.previousPairs.length];
  const fallback: ConversationalTurnResult = heuristicTurn
    ? { type: "question", question: heuristicTurn.question, chips: heuristicTurn.chips, source: "heuristic" }
    : { type: "ready", source: "heuristic" };

  const canBeReady = input.previousPairs.length >= MIN_CLARIFYING_TURNS;

  try {
    const readyInstruction = canBeReady
      ? `Уже задано ${input.previousPairs.length} вопросов. Если контекста достаточно — ответь: {"q":"","c":[]}`
      : `Уже задано ${input.previousPairs.length} вопросов. Нужно задать ещё, ответ {"q":"","c":[]} запрещён.`;

    const systemContent = [
      "Ты ведёшь диалог ясности на платформе ETerapy.",
      `Тема: ${input.topic ?? "неизвестна"}, сложность: ${input.difficulty ?? "неизвестна"}.`,
      "Задай ОДИН уточняющий вопрос, чтобы лучше понять ситуацию пользователя.",
      "",
      "Ответь строго в формате JSON (без markdown, без пояснений):",
      '{"q":"вопрос по-русски","c":["вариант 1","вариант 2","вариант 3"]}',
      "",
      "Пример: {\"q\":\"Как давно вы замечаете это состояние?\",\"c\":[\"Несколько дней\",\"Несколько недель\",\"Уже давно\"]}",
      "",
      "Правила:",
      "- Вопрос мягкий, конкретный, личный, не диагностический, на русском, до 160 символов",
      "- Три коротких варианта ответа (1-6 слов) на русском языке",
      readyInstruction,
      "- Не давай советов, не задавай вопросов о кризисах, медицине или праве",
    ].join("\n");

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemContent },
      { role: "user", content: input.originalQuestion },
    ];

    for (const pair of input.previousPairs) {
      messages.push({ role: "assistant", content: pair.question });
      messages.push({ role: "user", content: pair.answer });
    }

    const response = await aiComplete({
      feature: "dialogue-clarifier",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 300,
      temperature: 0.6,
      messages,
    });

    const parsed = parseConversationalTurnResponse(response.text);
    if (!parsed) return fallback;

    // Guard: LLM must not signal ready before minimum turns
    if (parsed.type === "ready" && !canBeReady) {
      return fallback;
    }

    return { ...parsed, provider: response.provider, model: response.model };
  } catch (error) {
    log.warn("dialogue-clarifier-conversational-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return fallback;
  }
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
      feature: "dialogue-clarifier",
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
