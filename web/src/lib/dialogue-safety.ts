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

/**
 * B601 · Оценка риска вреда в баллах, а не выключателем.
 *
 * Решение владельца 2026-07-27: оставить запрет только на ЯВНЫЕ угрозы
 * причинить вред себе или другому — «и то, только если они становятся явными
 * с подтверждениями слов, а не упоминаются вскользь». Шкала на 100 баллов,
 * как в антифроде (`registration-antifraud.ts`).
 *
 * Что было: одно слово из списка переводило разговор в кризис. «Он меня
 * убивает своим молчанием» и «я не хочу жить» получали один и тот же ответ,
 * и первому человеку разговор обрывали на ровном месте.
 *
 * ⚠ Границы слов проверяются через lookaround с явными классами символов:
 * `\b` в JS не работает с кириллицей и молча не совпадает никогда.
 */

export interface HarmRiskSignal {
  flag: string;
  score: number;
}

export interface HarmRiskResult {
  /** 0..100. */
  score: number;
  signals: HarmRiskSignal[];
}

/** Достаточно, чтобы говорить бережнее, но не обрывать разговор. */
export const HARM_ELEVATED_THRESHOLD = 40;
/** Явная подтверждённая угроза — кризисная маршрутизация обязательна. */
export const HARM_CRISIS_THRESHOLD = 70;

/**
 * Намерение от первого лица, направленное на себя. Это ядро сигнала: не слово
 * «суицид» само по себе, а «я» + намерение + направление на себя.
 */
const SELF_HARM_INTENT = [
  /покончить\s+с\s+собой/iu,
  /(?:убить\s+себя|себя\s+убить)/iu,
  /свести\s+счёты\s+с\s+жизнью/iu,
  /(?:не\s+хочу|не\s+могу\s+больше)\s+жить/iu,
  /хочу\s+(?:умереть|сдохнуть)/iu,
  /(?:порезать|резать)\s+себя/iu,
  /(?:совершить|planning)\s+суицид/iu,
  /суицидальн/iu,
];

/** Намерение от первого лица, направленное на другого человека. */
const OTHER_HARM_INTENT = [
  /(?:убью|прирежу|задушу)\s+(?:его|её|ее|их|этого|эту)/iu,
  /(?:хочу|собираюсь|готов[аы]?)\s+(?:его|её|ее|их)?\s*убить/iu,
  /(?:изобью|покалечу|сломаю\s+ему)/iu,
];

/**
 * Подтверждение словом: средство, план, срок, прощание. Именно это владелец
 * назвал «подтверждениями», отличающими угрозу от упоминания.
 */
const HARM_CONFIRMATION = [
  /(?:всё|все)\s+(?:приготовил|решил|готово)/iu,
  /(?:есть|взял|купил|достал)\s+(?:нож|таблетки|верёвк|веревк|оружие|пистолет)/iu,
  /(?:написал|оставил)\s+записку/iu,
  /(?:сегодня|завтра)\s+(?:вечером|ночью|утром)/iu,
  /(?:прощай|прощайте)/iu,
];

/**
 * Фигуральная речь и пересказ чужого. «Работа меня убивает» — это про
 * усталость, а не про угрозу, и обрывать такой разговор нельзя.
 */
const FIGURATIVE_MARKERS = [
  /убива[а-я]*\s+(?:сво[ей][йм]|эт|мен[яе]\s+эт)/iu,
  /со\s+смеху/iu,
  /(?:шутк|шучу|в\s+шутку|конечно\s+нет)/iu,
  /(?:фильм|сериал|книг|новост|игр)[а-я]*\s+про/iu,
];

export function scoreHarmRisk(text: string): HarmRiskResult {
  const signals: HarmRiskSignal[] = [];
  if (!text.trim()) return { score: 0, signals };

  if (SELF_HARM_INTENT.some((pattern) => pattern.test(text))) {
    signals.push({ flag: "self_harm_intent", score: 70 });
  }
  if (OTHER_HARM_INTENT.some((pattern) => pattern.test(text))) {
    signals.push({ flag: "other_harm_intent", score: 60 });
  }
  // Подтверждение усиливает намерение, но само по себе ничего не значит:
  // «купил таблетки» без намерения — это поход в аптеку.
  if (signals.length > 0 && HARM_CONFIRMATION.some((pattern) => pattern.test(text))) {
    signals.push({ flag: "harm_confirmation", score: 25 });
  }
  if (FIGURATIVE_MARKERS.some((pattern) => pattern.test(text))) {
    signals.push({ flag: "figurative_or_retold", score: -45 });
  }

  const raw = signals.reduce((sum, signal) => sum + signal.score, 0);
  return { score: Math.max(0, Math.min(100, raw)), signals };
}

/**
 * Детерминированная оценка без обращения к модели.
 *
 * B601: списки «диагноз | суд | налог | инвест | кредит» → `sensitive` и
 * «18+ | наркот | обмануть | взлом» → `blocked` сняты. Первый глушил
 * рекомендации любому, кто упомянул врача или ипотеку; второй блокировал
 * «как не дать себя обмануть». Обе категории теперь определяет только
 * классификатор-модель, у которой есть контекст фразы, а не подстрока.
 */
export function heuristicDialogueSafety(question: string): DialogueSafetyResult {
  const risk = scoreHarmRisk(question);
  if (risk.score >= HARM_CRISIS_THRESHOLD) {
    return {
      level: "crisis",
      reason: risk.signals.map((signal) => signal.flag).join(","),
      confidence: Math.min(1, risk.score / 100),
      source: "heuristic",
    };
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
            // B601: кризис — только ЯВНАЯ подтверждённая угроза, не упоминание.
            "Use crisis ONLY for an explicit, first-person, confirmed intent to harm oneself or another person — a stated plan, means, or timing. A figure of speech (\"this job is killing me\"), a retold film, a joke, or a passing mention is NOT crisis.",
            "Use sensitive only when the person is in acute distress right now. Asking about money, courts, doctors, the future, fortune-telling, tarot or fate is NOT sensitive.",
            "Use blocked only for requests to enable concrete harm to a person.",
            "Do not answer the user question.",
          ].join(" "),
        },
        { role: "user", content: input.question },
      ],
    });

    const parsed = parseDialogueSafetyResponse(response.text);
    // B601: раньше сбой разбора объявлял здоровому человеку «сейчас непросто» и
    // глушил ему рекомендации. Теперь при сбое отвечает детерминированная
    // оценка: явную угрозу она ловит сама, а на всём остальном молчит.
    if (!parsed) return heuristic;

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
    return heuristic;
  }
}
