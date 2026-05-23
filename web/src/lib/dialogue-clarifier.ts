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

function normalizeAssistantTurn(value: unknown) {
  if (typeof value !== "string") return null;
  const turn = value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (turn.length < 24) return null;
  return turn.slice(0, 700);
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

export function heuristicClarifyingQuestions(input: {
  question: string;
  topic?: string | null;
  difficulty?: string | null;
}): DialogueClarifyingQuestionsResult {
  const openingQuestion = input.topic === "relationships"
    ? "Что в этой ситуации с отношениями сейчас болит сильнее всего?"
    : input.topic === "career"
      ? "Что в рабочей ситуации сейчас сильнее всего требует ясности?"
      : input.topic === "anxiety"
        ? "В какой момент тревога становится заметнее всего?"
        : "Что сейчас самое важное для вас в этом вопросе?";

  return {
    questions: [
      openingQuestion,
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
  {
    question: "Слышу, что вам нужен не быстрый вердикт, а опора для следующего шага. Что в этом вопросе хочется понять прежде всего?",
    chips: ["Ясность", "Поддержка", "Действие"],
  },
  {
    question: "Похоже, часть ответа уже есть в том, что вы пробовали или избегали пробовать. Что из этого важно учесть сейчас?",
    chips: ["Ничего ещё", "Думал, но не пробовал", "Пробовал разное"],
  },
  {
    question: "Здесь важно отделить саму ситуацию от того, как она на вас действует. Что беспокоит сильнее всего?",
    chips: ["Неопределённость", "Отношения", "Мои чувства"],
  },
  {
    question: "В таком вопросе часто помогает смотреть не только на решение, но и на ощущение после него. Какой исход был бы спокойнее?",
    chips: ["Сохранить как есть", "Что-то изменить", "Начать заново"],
  },
  {
    question: "Сейчас полезно сузить фокус до одного результата, который даст вам больше устойчивости. Что хотелось бы получить?",
    chips: ["Понять себя", "Принять решение", "Двигаться дальше"],
  },
];

const CONTEXT_MARKERS: Array<{
  test: RegExp;
  question: (context: string) => string;
  chips: string[];
}> = [
  {
    test: /работ|руководител|коллег|команд|карьер|проект|иде/i,
    question: () => "Слышу, что вопрос не только про смену работы, а про то, как вернуть себе голос там, где ваши идеи обесценивают. Что в ситуации с работой и руководителем сильнее всего заставляет вас уменьшать свои идеи или голос?",
    chips: ["Страх оценки", "Усталость", "Хочу опору"],
  },
  {
    test: /отнош|партн|бывш|люб|семь|муж|жен/i,
    question: () => "Слышу, что в этой теме важен не абстрактный совет, а понимание, где вам больнее всего. В отношениях сейчас сильнее неопределённость, дистанция или ощущение, что вам приходится быть тише себя?",
    chips: ["Неопределённость", "Дистанция", "Я становлюсь тише"],
  },
  {
    test: /тревог|страх|паник|боюсь|напряж/i,
    question: () => "Похоже, тревога сейчас смешивает факты и ожидания. Если отделить тревогу от фактов, какой факт в этой ситуации точно есть прямо сейчас?",
    chips: ["Есть факт", "Больше ощущение", "Пока не знаю"],
  },
  {
    test: /деньг|кредит|ипотек|финанс|зарплат/i,
    question: () => "В денежной теме важно не усиливать страх, а вернуть управляемость. Вам сейчас важнее увидеть реальные ограничения, страх потери или следующий маленький шаг?",
    chips: ["Ограничения", "Страх потери", "Шаг"],
  },
];

function normalizePair(pair: { question?: string; answer?: string; assistant?: string; user?: string }) {
  return {
    question: pair.question ?? pair.assistant ?? "",
    answer: pair.answer ?? pair.user ?? "",
  };
}

function comparableTurn(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDuplicateAssistantTurn(
  candidate: string,
  previousPairs: Array<{ question?: string; answer?: string; assistant?: string; user?: string }>,
) {
  const candidateKey = comparableTurn(candidate);
  if (candidateKey.length < 24) return false;

  return previousPairs.some((pair) => {
    const previousKey = comparableTurn(normalizePair(pair).question);
    if (previousKey.length < 24) return false;
    return previousKey === candidateKey
      || (candidateKey.length > 48 && previousKey.includes(candidateKey))
      || (previousKey.length > 48 && candidateKey.includes(previousKey));
  });
}

function firstUnusedFallback(
  candidates: Array<{ question: string; chips: string[] }>,
  previousPairs: Array<{ question?: string; answer?: string; assistant?: string; user?: string }>,
): ConversationalTurnResult {
  const next = candidates.find((candidate) => !isDuplicateAssistantTurn(candidate.question, previousPairs));
  return next
    ? { type: "question", question: next.question, chips: next.chips, source: "heuristic" }
    : { type: "ready", source: "heuristic" };
}

function buildContextualFallback(input: {
  originalQuestion?: string;
  question?: string;
  previousPairs: Array<{ question?: string; answer?: string; assistant?: string; user?: string }>;
}): ConversationalTurnResult {
  const originalQuestion = input.originalQuestion ?? input.question ?? "";
  const normalizedPairs = input.previousPairs.map(normalizePair);
  if (normalizedPairs.length >= MIN_CLARIFYING_TURNS) {
    return { type: "ready", source: "heuristic" };
  }

  const lastAnswer = normalizedPairs.at(-1)?.answer ?? "";
  const context = [originalQuestion, lastAnswer].filter(Boolean).join("\n");
  const candidates: Array<{ question: string; chips: string[] }> = [];
  const marker = CONTEXT_MARKERS.find((entry) => entry.test.test(context));
  if (marker) {
    candidates.push({ question: marker.question(context), chips: marker.chips });
  }

  candidates.push(...HEURISTIC_QUESTION_POOL);
  return firstUnusedFallback(candidates, input.previousPairs);
}

function parseConversationalTurnResponse(text: string): ConversationalTurnResult | null {
  const json = extractJson(text);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    // Accept both short format {q, c} and legacy {type, question, chips}
    const q = typeof parsed.q === "string" ? parsed.q
      : typeof parsed.message === "string" ? parsed.message
      : typeof parsed.answer === "string" ? parsed.answer
      : typeof parsed.question === "string" ? parsed.question
      : null;
    // Empty q or explicit ready signal = model is done
    if ((typeof q === "string" && q.trim() === "") || parsed.type === "ready") return { type: "ready", source: "ai" };
    const rawChips = Array.isArray(parsed.c) ? parsed.c
      : Array.isArray(parsed.chips) ? parsed.chips
      : [];
    const question = normalizeAssistantTurn(q);
    if (!question) return null;
    return { type: "question", question, chips: normalizeChips(rawChips), source: "ai" };
  } catch {
    return null;
  }
}

export async function generateDialogueConversationalTurn(input: {
  originalQuestion?: string;
  question?: string;
  previousPairs: Array<{ question?: string; answer?: string; assistant?: string; user?: string }>;
  topic?: string | null;
  difficulty?: string | null;
  safetyLevel?: string | null;
  userId?: string | null;
  requestId?: string;
}): Promise<ConversationalTurnResult> {
  if (input.previousPairs.length >= MAX_CLARIFYING_TURNS) {
    return { type: "ready", source: "heuristic" };
  }

  const originalQuestion = input.originalQuestion ?? input.question ?? "";
  const previousPairs = input.previousPairs.map(normalizePair);
  const fallback = buildContextualFallback({ originalQuestion, previousPairs });

  const canBeReady = input.previousPairs.length >= MIN_CLARIFYING_TURNS;

  try {
    const readyInstruction = canBeReady
      ? `Уже был ${input.previousPairs.length} живой обмен. Если контекста достаточно для первичного ответа — верни {"q":"","c":[]}.`
      : "Это первый ход после вопроса пользователя: нужно коротко отозваться и задать один уточняющий вопрос, ready запрещён.";

    const systemContent = [
      "Ты ведёшь диалог ясности на платформе ETerapy.",
      `Тема: ${input.topic ?? "неизвестна"}, сложность: ${input.difficulty ?? "неизвестна"}.`,
      "Ответь короткой живой репликой: покажи, что услышал конкретные слова пользователя, и задай ОДИН следующий вопрос только если он нужен.",
      "Это диалог с человеком, не анкета: нельзя выдавать пачку вопросов, нумерацию, одинаковые формулировки или универсальный сценарий.",
      "",
      "Ответь строго в формате JSON (без markdown, без пояснений):",
      '{"q":"короткая живая реплика + один вопрос по-русски","c":["вариант 1","вариант 2","вариант 3"]}',
      "",
      "Пример: {\"q\":\"Слышу, что вам важно не ошибиться и сохранить устойчивость. Что в этой ситуации сильнее всего просит ясности прямо сейчас?\",\"c\":[\"Решение\",\"Спокойствие\",\"Следующий шаг\"]}",
      "",
      "Правила:",
      "- q: 2-4 коротких предложения, до 500 символов, мягко, конкретно, лично, не диагностически",
      "- Три коротких варианта ответа (1-6 слов) на русском языке",
      "- Не повторяй уже заданные вопросы и не используй безличные шаблоны вроде «что сейчас самое важное»",
      readyInstruction,
      "- Не ставь диагнозов, не предсказывай гарантированный исход, не давай медицинских, юридических или финансовых советов",
    ].join("\n");

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemContent },
      { role: "user", content: originalQuestion },
    ];

    for (const pair of previousPairs) {
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
    if (!parsed) {
      log.warn("dialogue-clarifier-invalid-turn", {
        requestId: input.requestId,
        topic: input.topic,
        previousPairCount: previousPairs.length,
        provider: response.provider,
        model: response.model,
      });
      return fallback;
    }

    // Guard: LLM must not signal ready before minimum turns
    if (parsed.type === "ready" && !canBeReady) {
      return fallback;
    }
    if (parsed.type === "question" && parsed.question && isDuplicateAssistantTurn(parsed.question, previousPairs)) {
      log.warn("dialogue-clarifier-duplicate-turn", {
        requestId: input.requestId,
        topic: input.topic,
        previousPairCount: previousPairs.length,
        provider: response.provider,
        model: response.model,
      });
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
