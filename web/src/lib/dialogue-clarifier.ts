import { aiComplete } from "@/lib/ai";
import { buildClarifierSystemPrompt } from "@/lib/dialogue-clarifier-prompt";
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
  /** Реплика целиком (отражение + вопрос) — то, что видит клиент. */
  question?: string;
  /**
   * B554: только вопросительная часть `q`, без отражения. Дубликаты ловились по
   * склеенной реплике, поэтому модель могла задать ТОТ ЖЕ вопрос с новым
   * отражением, и проверка его пропускала. На живом прогоне это и случилось:
   * клиент написал «мне это не помогает», а в ответ пришёл дословно тот же
   * вопрос и те же подсказки.
   */
  askedQuestion?: string;
  chips?: string[];
  source: "ai" | "heuristic";
  provider?: string;
  model?: string;
}

// B554 (owner 2026-07-21): «не перегружал его вопросами». Триаж закрывается за
// 2–4 хода: пол опущен 3→2, потолок 5→4. Пол нужен только чтобы модель не
// сорвалась в разбор с первой реплики; выше него решает она сама по критерию
// достаточности (четыре пункта в промте), а не счётчик.
const MIN_CLARIFYING_TURNS = 2;
const MAX_CLARIFYING_TURNS = 4;

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
// B554: различитель — местоимение «вас», а не длина фразы. «Что ВАС
// останавливает» спрашивает про внутреннюю причину человека, то есть это то же
// «почему» другими словами. «Что останавливает в последний момент» — про
// наблюдаемый момент, и это ровно та замена, которую рекомендуют эксперты
// (см. B554-triage-prompt-expertise.md, таблица «вместо → так»). Поэтому
// безличную форму пропускаем, а личную отбраковываем в любом виде.
const INTERROGATION_PATTERNS = [
  /^\s*почему(?=\s|$)/iu,
  /^\s*зачем(?=\s|$)/iu,
  /что\s+вас\s+останавливает/iu,
  /что\s+останавливает\s+вас/iu,
  /что\s+вас\s+(беспокоит|тревожит|смущает|пугает)/iu,
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

/**
 * B560: зачины-зеркала, которыми модель открывает ответ вместо мысли.
 * Живой прогон против YandexGPT Lite показал, что запрет в промте держится не
 * всегда: «Вы упомянули, что денег хватает…» пролезал и после явного «никогда
 * не пересказывай». Дешёвая модель плохо исполняет отрицания, поэтому рядом с
 * инструкцией стоит детерминированная подчистка.
 */
const ECHO_OPENERS = /^(вы\s+(говорите|упомянули|пишете|сказали|отметили|описываете|рассказали)|как\s+вы\s+(говорите|отметили|пишете)|если\s+я\s+правильно\s+понимаю|то\s+есть|похоже[,\s]|звучит\s+так[,\s]|итак[,\s])/i;

/** Доля слов первого предложения, взятых из реплики пользователя. */
function openingEchoRatio(sentence: string, userAnswer: string): number {
  const words = (value: string) => comparableTurn(value).split(" ").filter((word) => word.length > 3);
  const sentenceWords = words(sentence);
  if (sentenceWords.length === 0) return 0;
  const userWords = new Set(words(userAnswer));
  return sentenceWords.filter((word) => userWords.has(word)).length / sentenceWords.length;
}

/**
 * B560: срезает вступление-пересказ, если после него остаётся содержательный
 * вопрос. Владелец описал ровно этот дефект: «каждая моя реплика в ответ
 * сопровождается почти полным повтором моей реплики, а затем уже интересной
 * мыслью» — интересную мысль и оставляем.
 */
export function stripEchoOpening(question: string, userAnswer: string): string {
  const trimmed = question.trim();
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2) return trimmed;

  const [first, ...rest] = sentences;
  const remainder = rest.join(" ").trim();
  // Хвост без вопроса — не подчищаем: лучше эхо, чем реплика без вопроса.
  if (!remainder.includes("?")) return trimmed;

  const mirrors = ECHO_OPENERS.test(first.trim()) || openingEchoRatio(first, userAnswer) >= 0.5;
  return mirrors ? remainder : trimmed;
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

/**
 * B554: тот же вопрос под новым отражением. Предыдущие ходы хранятся склеенной
 * репликой («отражение вопрос»), поэтому повтор ловится вхождением очищенного
 * вопроса в очищенную прошлую реплику. Порог ниже, чем у проверки реплики
 * целиком: вопрос короче, а повтор именно вопроса — самый заметный клиенту
 * признак «бота, который меня не слышит».
 */
const REPEATED_QUESTION_MIN_CHARS = 16;

function isRepeatedQuestion(
  askedQuestion: string | undefined,
  previousPairs: Array<{ question?: string; answer?: string; assistant?: string; user?: string }>,
) {
  if (!askedQuestion) return false;
  const key = comparableTurn(askedQuestion);
  if (key.length < REPEATED_QUESTION_MIN_CHARS) return false;
  return previousPairs.some((pair) => comparableTurn(normalizePair(pair).question).includes(key));
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
      // B554: готовность — явное булево решение `d`, которое модель принимает
      // ПЕРВЫМ ключом, до того как напишет вопрос. Живые прогоны показали, что
      // «верни пустой объект» YandexGPT Pro не исполняет ни разу за диалог: он
      // всегда дописывает ещё один вопрос и упирается в потолок ходов — ровно
      // то «перегружает вопросами», на что жаловался owner. Булев флаг модель
      // держит надёжно. Пустой q оставлен как совместимый запасной сигнал.
      if (parsed.d === true) return { type: "ready", source: "ai" };
      // Empty q or explicit ready signal = model is done
      if ((typeof q === "string" && q.trim() === "") || parsed.type === "ready") return { type: "ready", source: "ai" };
      const rawChips = Array.isArray(parsed.c) ? parsed.c
        : Array.isArray(parsed.chips) ? parsed.chips
        : [];
      const question = normalizeAssistantTurn(reflection ? `${reflection} ${q ?? ""}` : q);
      if (question) {
        return {
          type: "question",
          question,
          askedQuestion: typeof q === "string" ? q.trim() : undefined,
          chips: normalizeChips(rawChips),
          source: "ai",
        };
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
}): Promise<{ result: ConversationalTurnResult; provider?: string; model?: string; degraded?: boolean } | null> {
  const systemContent = buildClarifierSystemPrompt({
    originalQuestion: input.originalQuestion,
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
    // B560: сначала снимаем вступление-зеркало, потом уже оцениваем качество —
    // иначе ответ с хорошей мыслью отвергался (или принимался «как есть») из-за
    // одного лишнего первого предложения.
    parsed.question = stripEchoOpening(parsed.question, lastAnswer);
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
      // На первой попытке отвергаем и уходим в retry. Но на повторе принимаем
      // как есть: пропустить уточнение целиком хуже, чем задать слабый вопрос —
      // иначе клиент вместо диалога сразу получает разбор (что и случилось на
      // staging, когда эта проверка возвращала null на обеих попытках).
      if (!input.retry) return null;
      return { result: parsed, provider: response.provider, model: response.model, degraded: true };
    }
  }

  if (
    parsed.type === "question"
    && parsed.question
    && (isDuplicateAssistantTurn(parsed.question, input.previousPairs)
      || isRepeatedQuestion(parsed.askedQuestion, input.previousPairs))
  ) {
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
