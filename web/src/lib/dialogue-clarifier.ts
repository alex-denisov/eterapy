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

// B554: подсказка — это короткий вариант ОТВЕТА пользователя, по которому можно
// тапнуть. Модель регулярно возвращала сюда встречные вопросы («А что вы
// думаете?»), и клиент видел в чипах вопросы вместо ответов. Отсекаем
// детерминированно: вопросительный знак, вопросительное слово в начале и
// «чипы»-предложения.
// `\b` в JS опирается на ASCII-класс \w, поэтому после кириллицы границы слова
// не существует — используем явный просмотр вперёд на пробел или конец строки.
const CHIP_INTERROGATIVE_OPENERS = new RegExp(
  "^(что|как|какой|какая|какое|какие|почему|зачем|когда|где|куда|откуда|кто|"
  + "кому|кем|чем|чего|чей|сколько|разве|неужели|можно ли|стоит ли)(?=\\s|$)",
  "iu",
);
const CHIP_MAX_CHARS = 32;
const CHIP_MAX_WORDS = 5;

function normalizeChip(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const chip = value.replace(/\s+/g, " ").trim();
  if (chip.length < 2 || chip.length > CHIP_MAX_CHARS) return null;
  if (chip.includes("?")) return null;
  if (CHIP_INTERROGATIVE_OPENERS.test(chip)) return null;
  if (chip.split(" ").length > CHIP_MAX_WORDS) return null;
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
      ? "Что в рабочей ситуации сейчас сильнее всего требует внимания?"
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
      ["Понять", "Поддержка", "Действие"],
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

// B554 (owner round 3): даже YandexGPT Pro устойчиво возвращает «отражение»,
// которое является пересказом реплики пользователя с заменой лица («Я всё время
// откладываю» → «Вы всё время откладываете»), и вопрос-допрос («Что вас
// останавливает?»). Промт это запрещает, но соблюдение инструкций у модели
// нестабильно, поэтому проверяем детерминированно и уходим в существующий
// retry — так же, как с дубликатами ходов.
// `\b` в JS опирается на ASCII-класс \w, поэтому после кириллицы границы слова
// не существует — везде явный просмотр вперёд.
const INTERROGATION_PATTERNS = [
  /^\s*почему(?=\s|$)/iu,
  /^\s*зачем(?=\s|$)/iu,
  /что\s+вас\s+(останавливает|беспокоит|тревожит|смущает|пугает)/iu,
  /что\s+именно\s+(вызывает|мешает|останавливает)/iu,
  /в\s+ч[её]м\s+причина/iu,
  /почему\s+(вы|это|так)(?=\s|$|[?,.])/iu,
];

export function isInterrogationQuestion(question: string): boolean {
  return INTERROGATION_PATTERNS.some((pattern) => pattern.test(question));
}

/** Доля слов ответа пользователя, дословно перенесённых в реплику ассистента. */
export function echoRatio(assistantTurn: string, userAnswer: string): number {
  const words = (value: string) => comparableTurn(value)
    .split(" ")
    .filter((word) => word.length > 3);
  const userWords = words(userAnswer);
  if (userWords.length < 4) return 0;
  const assistantWords = new Set(words(assistantTurn));
  const shared = userWords.filter((word) => assistantWords.has(word)).length;
  return shared / userWords.length;
}

const ECHO_REJECT_RATIO = 0.7;

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

// Issue #3 (RU launch): the clarifying dialogue is ALWAYS LLM-driven. There is
// no scripted/heuristic question pool. When the model cannot produce a valid
// turn (after same-provider multi-model retries), we resolve to "ready" so the
// flow proceeds to the разбор (itself LLM-written) — never to a preset question
// pretending to be "live LLM" (the "это явно сценарные ответы" complaint).
const READY_TURN: ConversationalTurnResult = { type: "ready", source: "ai" };

export function parseConversationalTurnResponse(text: string): ConversationalTurnResult | null {
  // Try JSON first — that's our preferred contract.
  const json = extractJson(text);
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      // Accept both short format {q, c} and legacy {type, question, chips}
      const q = typeof parsed.q === "string" ? parsed.q
        : typeof parsed.message === "string" ? parsed.message
        : typeof parsed.answer === "string" ? parsed.answer
        : typeof parsed.question === "string" ? parsed.question
        : null;
      // B554: отражение приходит отдельным полем `m`. Пока оно было частью
      // свободной строки `q`, проверить его наличие было нечем — и модель
      // сваливалась в чистый опросник, на что и пожаловался owner.
      const reflection = typeof parsed.m === "string" ? parsed.m.trim()
        : typeof parsed.reflection === "string" ? parsed.reflection.trim()
        : "";
      // Empty q or explicit ready signal = model is done
      if ((typeof q === "string" && q.trim() === "") || parsed.type === "ready") return { type: "ready", source: "ai" };
      const rawChips = Array.isArray(parsed.c) ? parsed.c
        : Array.isArray(parsed.chips) ? parsed.chips
        : [];
      const question = normalizeAssistantTurn(reflection ? `${reflection} ${q ?? ""}` : q);
      if (question) {
        return { type: "question", question, chips: normalizeChips(rawChips), source: "ai" };
      }
    } catch {
      // Malformed JSON (e.g. a missing bracket — a real model output we saw in
      // prod). Salvage the q/c fields with a regex instead of leaking the raw
      // JSON envelope into the chat as if it were the assistant's reply.
      const qMatch = json.match(/"q"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (qMatch) {
        if (qMatch[1].trim() === "") return { type: "ready", source: "ai" };
        const salvagedQ = normalizeAssistantTurn(
          qMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\"),
        );
        if (salvagedQ) {
          const cMatch = json.match(/"c"\s*:\s*\[([\s\S]*?)(?:\]|\}|$)/);
          const rawChips = cMatch
            ? (cMatch[1].match(/"((?:\\.|[^"\\])*)"/g) ?? []).map((s) => s.slice(1, -1))
            : [];
          return { type: "question", question: salvagedQ, chips: normalizeChips(rawChips), source: "ai" };
        }
      }
      // Unsalvageable JSON → return null so the caller retries / goes ready.
      // Never fall through to the plain-text rescue with a JSON envelope.
      return null;
    }
  }

  // Liberal fallback: some local models forget the JSON envelope. If the
  // model returned a non-empty natural-language reply that looks like a
  // question, treat that as the turn and synthesize empty chips. Keeps
  // the dialogue LLM-driven instead of dropping to the heuristic pool.
  // Guard: never treat a JSON-looking envelope as a natural-language reply.
  const looksLikeJsonEnvelope = /^\s*[{[]/.test(text) || /"q"\s*:/.test(text) || /"c"\s*:/.test(text);
  const cleaned = normalizeAssistantTurn(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  if (!looksLikeJsonEnvelope && cleaned && /[?!.]/.test(cleaned)) {
    return { type: "question", question: cleaned, chips: [], source: "ai" };
  }
  return null;
}

function buildSystemPrompt(input: {
  topic?: string | null;
  difficulty?: string | null;
  previousPairsCount: number;
  canBeReady: boolean;
  retry: boolean;
}): string {
  const readyInstruction = input.canBeReady
    ? `Уже был ${input.previousPairsCount} живой обмен. Если контекста достаточно для первичного ответа — верни {"q":"","c":[]}.`
    : "Это начало диалога: нужно коротко отозваться на сказанное и задать один уточняющий вопрос. Сигнал ready запрещён.";

  const retryHint = input.retry
    ? "Предыдущий ответ отвергнут: он либо пересказывал реплику пользователя своими же словами с заменой лица, либо задавал вопрос-допрос («что вас останавливает», «почему»). Сформулируй заново: в m назови СВОЁ наблюдение о сказанном (что за этим стоит, с чем это связано), в q спроси про конкретное и наблюдаемое."
    : "";

  return [
    "Ты ведёшь разбор на платформе ETerapy. Пользователь делится живой ситуацией — ты помогаешь ему её прояснить.",
    `Тема: ${input.topic ?? "неизвестна"}, сложность: ${input.difficulty ?? "неизвестна"}.`,
    "",
    "Ты практик, который ВЕДЁТ разбор, а не интервьюер, собирающий анкету. На каждом ходе ты сначала возвращаешь человеку то, что услышал (и, если это уместно, называешь замеченную связь или противоречие), и только потом задаёшь ОДИН следующий вопрос.",
    "Это диалог с человеком, не анкета. Нельзя выдавать пачку вопросов, нумерацию, одинаковые формулировки, безличные шаблоны или универсальный сценарий.",
    "Контекст строится из всех предыдущих сообщений: учитывай конкретные детали, имена, обстоятельства и ответы пользователя — каждая следующая реплика должна явно их использовать.",
    "",
    "Ответь СТРОГО в формате JSON (без markdown, без префиксов, без пояснений):",
    '{"m":"отражение последней реплики пользователя","q":"один вопрос по-русски","c":["вариант 1","вариант 2","вариант 3"]}',
    "",
    "Пример (первый ход): {\"m\":\"Слышу, что вам важно не ошибиться и при этом сохранить устойчивость.\",\"q\":\"Что в этой ситуации сильнее всего просит внимания прямо сейчас?\",\"c\":[\"Решение\",\"Спокойствие\",\"Следующий шаг\"]}",
    "Пример (после ответа «страх оценки»): {\"m\":\"Страх оценки вы называете первым — и раньше сказали, что молчите на встречах. Похоже, это одна и та же линия.\",\"q\":\"Этот страх больше про реакцию руководителя или про что-то более давнее?\",\"c\":[\"Реакция шефа\",\"Давнее\",\"Привычка молчать\"]}",
    "",
    "Правила:",
    "- m: 1-2 предложения. ОБЯЗАТЕЛЬНО опирайся на конкретное слово/фразу из ПОСЛЕДНЕЙ реплики пользователя. Пустое m недопустимо, пока диалог продолжается",
    "- НЕЛЬЗЯ повторять реплику пользователя дословно или почти дословно: отражение — это твоё понимание сказанного своими словами («хожу по кругу» → «решение буксует не из-за нехватки информации»), а не эхо",
    "- В m разрешено и приветствуется назвать замеченную связь между тем, что человек сказал сейчас и раньше — именно это отличает практика от опросника",
    "- q: ровно ОДИН вопрос, до 200 символов, мягко, конкретно, лично, не диагностически",
    "- c: три коротких ВАРИАНТА ОТВЕТА пользователя (1-5 слов). Это то, что человек мог бы ответить, а не то, что можно у него спросить. Вопросы в c запрещены",
    "- Не повторяй уже заданные вопросы и не используй безличные шаблоны вроде «что сейчас самое важное»",
    // Owner 2026-07-21: «диалог всё время спрашивает "почему" на любое моё
    // сообщение, это бесит жутко». «Почему» требует от человека объяснять и
    // защищаться; живой практик спрашивает про конкретику, а не про причину.
    "- ЗАПРЕЩЕНО начинать вопрос с «Почему» и «Зачем», а также спрашивать «что именно вызывает», «что вас беспокоит», «в чём причина». Это допрос, а не разговор",
    "- Спрашивай про наблюдаемое и конкретное: когда это заметно сильнее всего, что происходит прямо перед этим, что уже пробовали, как это выглядит со стороны, что изменилось бы, если бы вопрос решился",
    readyInstruction,
    retryHint,
    "- Не ставь диагнозов, не предсказывай гарантированный исход, не давай медицинских, юридических или финансовых советов",
  ].filter(Boolean).join("\n");
}

async function attemptLlmTurn(input: {
  originalQuestion: string;
  previousPairs: Array<{ question: string; answer: string }>;
  topic?: string | null;
  difficulty?: string | null;
  userId?: string | null;
  requestId?: string;
  canBeReady: boolean;
  retry: boolean;
  temperature: number;
}): Promise<{ result: ConversationalTurnResult; provider?: string; model?: string } | null> {
  const systemContent = buildSystemPrompt({
    topic: input.topic,
    difficulty: input.difficulty,
    previousPairsCount: input.previousPairs.length,
    canBeReady: input.canBeReady,
    retry: input.retry,
  });

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
    maxTokens: 400,
    temperature: input.temperature,
    messages,
  });

  const parsed = parseConversationalTurnResponse(response.text);
  if (!parsed) {
    log.warn("dialogue-clarifier-invalid-turn", {
      requestId: input.requestId,
      topic: input.topic,
      previousPairCount: input.previousPairs.length,
      provider: response.provider,
      model: response.model,
      retry: input.retry,
    });
    return null;
  }

  if (parsed.type === "ready" && !input.canBeReady) {
    log.warn("dialogue-clarifier-premature-ready", {
      requestId: input.requestId,
      previousPairCount: input.previousPairs.length,
      retry: input.retry,
    });
    return null;
  }

  if (parsed.type === "question" && parsed.question) {
    const lastAnswer = input.previousPairs.at(-1)?.answer ?? input.originalQuestion;
    const echoed = echoRatio(parsed.question, lastAnswer) >= ECHO_REJECT_RATIO;
    const interrogation = isInterrogationQuestion(parsed.question);
    if (echoed || interrogation) {
      log.warn("dialogue-clarifier-low-quality-turn", {
        requestId: input.requestId,
        reason: echoed ? "echo" : "interrogation",
        previousPairCount: input.previousPairs.length,
        provider: response.provider,
        model: response.model,
        retry: input.retry,
      });
      return null;
    }
  }

  if (parsed.type === "question" && parsed.question && isDuplicateAssistantTurn(parsed.question, input.previousPairs)) {
    log.warn("dialogue-clarifier-duplicate-turn", {
      requestId: input.requestId,
      topic: input.topic,
      previousPairCount: input.previousPairs.length,
      provider: response.provider,
      model: response.model,
      retry: input.retry,
    });
    return null;
  }

  return { result: parsed, provider: response.provider, model: response.model };
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

  const canBeReady = input.previousPairs.length >= MIN_CLARIFYING_TURNS;

  // Issue #3: no scripted questions, ever. `canBeReady` still gates the LLM's
  // own ready-signal (a healthy model keeps asking until the 3-turn floor), but
  // when the model genuinely can't produce a valid turn we resolve to "ready"
  // and let the (LLM-written) разбор take over — we never fabricate a preset
  // question to pad the floor.
  const fallback: ConversationalTurnResult = READY_TURN;

  // Try LLM up to twice before falling back. The second attempt uses a
  // higher temperature and an explicit "your previous answer was
  // rejected" hint so we don't get the same broken output twice.
  try {
    const first = await attemptLlmTurn({
      originalQuestion,
      previousPairs,
      topic: input.topic,
      difficulty: input.difficulty,
      userId: input.userId,
      requestId: input.requestId,
      canBeReady,
      retry: false,
      temperature: 0.65,
    });
    if (first) {
      return { ...first.result, provider: first.provider, model: first.model };
    }

    const second = await attemptLlmTurn({
      originalQuestion,
      previousPairs,
      topic: input.topic,
      difficulty: input.difficulty,
      userId: input.userId,
      requestId: input.requestId,
      canBeReady,
      retry: true,
      temperature: 0.85,
    });
    if (second) {
      return { ...second.result, provider: second.provider, model: second.model };
    }

    log.warn("dialogue-clarifier-ready-fallback-after-retries", {
      requestId: input.requestId,
      previousPairCount: previousPairs.length,
    });
    return fallback;
  } catch (error) {
    log.warn("dialogue-clarifier-conversational-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return fallback;
  }
}

/**
 * W18: when a per-turn LLM response omits its `c` (chip) array — which happens
 * more often on later turns as the context grows — derive 3 relevant answer
 * chips for the question with a tiny dedicated call, instead of falling back to
 * the same generic static chips (Скорее да / Скорее нет / …) on every turn.
 */
export async function generateAnswerChips(input: {
  question: string;
  previousPairs?: Array<{ question: string; answer: string }>;
  topic?: string | null;
  userId?: string | null;
  requestId?: string;
}): Promise<string[]> {
  const question = input.question?.trim();
  if (!question) return [];
  try {
    const ctx = (input.previousPairs ?? [])
      .slice(-2)
      .map((pair) => `В: ${pair.question}\nО: ${pair.answer}`)
      .join("\n");
    const response = await aiComplete({
      feature: "dialogue-clarifier",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 100,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Ты помогаешь пользователю быстро ответить на вопрос в разборе.",
            "Верни СТРОГО JSON-массив из 3 коротких (1–6 слов) конкретных вариантов ответа на русском,",
            "релевантных ИМЕННО этому вопросу и контексту — это реальные опции, а не общие категории.",
            'Пример: ["Реакция шефа","Давнее","Привычка молчать"]. Только массив, без markdown и пояснений.',
          ].join(" "),
        },
        { role: "user", content: `${ctx ? `${ctx}\n\n` : ""}Вопрос: ${question}` },
      ],
    });
    const cleaned = response.text.trim().replace(/^```json\s*|^```\s*|```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      const chips = parsed
        .filter((chip): chip is string => typeof chip === "string" && chip.trim().length > 0)
        .map((chip) => chip.trim().slice(0, 40))
        .slice(0, 3);
      if (chips.length >= 2) return chips;
    }
  } catch (error) {
    log.warn("dialogue-clarifier-chip-derivation-failed", {
      requestId: input.requestId,
      error: serializeError(error),
    });
  }
  return [];
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
