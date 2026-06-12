import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

// B385 «Вместе» — three scenarios merged onto existing engines:
//   - "outside"       → ClarityCircle engine (account-less invited answers)
//   - "compare"       → Compatibility engine (symmetric, both consent)
//   - "compatibility" → Compatibility engine (relationship mode)
// The standalone «Круг» product is closed; its multi-participant
// mechanic now powers scenario A ("Взгляд со стороны").

export type TogetherScenarioKey = "outside" | "compare" | "compatibility";
export type TogetherEngine = "outside" | "compatibility";

export interface TogetherScenario {
  key: TogetherScenarioKey;
  eyebrow: string;
  title: string;
  blurb: string;
  bullets: readonly string[];
  engine: TogetherEngine;
  href: string;
}

export const TOGETHER_SCENARIOS: readonly TogetherScenario[] = [
  {
    key: "outside",
    eyebrow: "сценарий 1",
    title: "Взгляд со стороны",
    blurb:
      "Опишите ситуацию — мы соберём 3–5 бережных вопросов для близкого человека. " +
      "Он ответит по ссылке за 2–3 минуты, без регистрации. Полный разбор увидите вы.",
    bullets: [
      "Приглашённый отвечает по ссылке, без аккаунта",
      "Ваши приватные детали ему не видны — только нейтральные вопросы",
      "Можно расширить до 5 близких",
    ],
    engine: "outside",
    href: "/products/pair?scenario=outside",
  },
  {
    key: "compare",
    eyebrow: "сценарий 2",
    title: "Сверить взгляды",
    blurb:
      "Каждый отвечает отдельно и по согласию. Общий итог открывается только когда " +
      "согласны оба — чтобы разбор не превратился в контроль или спор.",
    bullets: [
      "Симметрично: оба отвечают своей стороной",
      "Итог — только по согласию обоих",
      "Приватные ответы партнёра скрыты до результата",
    ],
    engine: "compatibility",
    href: "/products/pair?scenario=compare",
  },
  {
    key: "compatibility",
    eyebrow: "сценарий 3",
    title: "Совместимость",
    blurb:
      "Режим для пары, дружбы, работы или семьи: два взгляда на связь и тёплый разбор " +
      "точек согласия, зон напряжения и одного аккуратного шага.",
    bullets: [
      "Точки пересечения и зоны напряжения",
      "Языки заботы и сценарии общения",
      "Один совместный шаг на ближайшую неделю",
    ],
    engine: "compatibility",
    href: "/products/compatibility",
  },
] as const;

export function getTogetherScenario(key: string): TogetherScenario | null {
  return TOGETHER_SCENARIOS.find((scenario) => scenario.key === key) ?? null;
}

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 5;
const MAX_QUESTION_LENGTH = 180;
// A verbatim run this long shared with the private situation is treated as a leak.
const LEAK_RUN_WORDS = 5;

const FALLBACK_QUESTIONS: readonly string[] = [
  "Как тебе видится эта ситуация со стороны?",
  "Что, на твой взгляд, человек в ней может не замечать?",
  "Какой шаг здесь кажется тебе самым бережным?",
  "Где, по-твоему, в этой ситуации больше всего напряжения?",
  "Что бы помогло человеку почувствовать себя спокойнее?",
];

function clampCount(count: number): number {
  if (count < MIN_QUESTIONS) return MIN_QUESTIONS;
  if (count > MAX_QUESTIONS) return MAX_QUESTIONS;
  return count;
}

export function heuristicOutsideViewQuestions(count = 4): string[] {
  return FALLBACK_QUESTIONS.slice(0, clampCount(count));
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// A question leaks if it repeats a run of LEAK_RUN_WORDS+ consecutive words
// taken verbatim from the initiator's private situation.
export function questionLeaksPrivateDetail(question: string, situation: string): boolean {
  const questionWords = normalizeWords(question);
  if (questionWords.length < LEAK_RUN_WORDS) return false;
  const situationText = ` ${normalizeWords(situation).join(" ")} `;
  for (let i = 0; i + LEAK_RUN_WORDS <= questionWords.length; i += 1) {
    const run = questionWords.slice(i, i + LEAK_RUN_WORDS).join(" ");
    if (situationText.includes(` ${run} `)) return true;
  }
  return false;
}

export function parseQuestionLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => (line.length > MAX_QUESTION_LENGTH ? line.slice(0, MAX_QUESTION_LENGTH).trim() : line));
}

// Filter out empty/duplicate/leaky questions, clamp to 3–5, top up from the
// neutral fallback set so the invited person always sees a complete, safe set.
export function sanitizeOutsideViewQuestions(questions: string[], situation: string): string[] {
  const seen = new Set<string>();
  const safe: string[] = [];
  for (const raw of questions) {
    const question = raw.trim();
    if (!question) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    if (questionLeaksPrivateDetail(question, situation)) continue;
    seen.add(key);
    safe.push(question);
    if (safe.length >= MAX_QUESTIONS) break;
  }
  for (const fallback of FALLBACK_QUESTIONS) {
    if (safe.length >= MIN_QUESTIONS) break;
    const key = fallback.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    safe.push(fallback);
  }
  return safe.slice(0, MAX_QUESTIONS);
}

export interface OutsideViewQuestions {
  questions: string[];
  source: "ai" | "heuristic";
}

export async function generateOutsideViewQuestions(input: {
  situation: string;
  userId?: string | null;
  requestId?: string;
}): Promise<OutsideViewQuestions> {
  const situation = input.situation.trim().slice(0, 4000);
  if (situation.length < 10) {
    return { questions: heuristicOutsideViewQuestions(), source: "heuristic" };
  }

  try {
    const response = await aiComplete({
      feature: "product-outside-questions",
      userId: input.userId ?? undefined,
      requestId: input.requestId,
      maxTokens: 400,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: [
            "You generate questions for ETerapy's «Взгляд со стороны» feature, in Russian.",
            "A person described a private situation; you write 3–5 short, neutral questions",
            "for a close friend to answer about it.",
            "CRITICAL: the questions must be general and must NOT reveal any private detail,",
            "name, place, or specific fact from the situation — the friend never sees the situation itself.",
            "Address the responder informally (на «ты»). Be warm, non-judgmental, non-fatalistic.",
            "Output ONLY the questions, one per line, no numbering, no preamble.",
          ].join(" "),
        },
        { role: "user", content: situation },
      ],
    });

    const parsed = parseQuestionLines(response.text);
    const safe = sanitizeOutsideViewQuestions(parsed, situation);
    const aiCount = parsed.filter((q) => !questionLeaksPrivateDetail(q, situation)).length;
    if (aiCount >= MIN_QUESTIONS) {
      return { questions: safe, source: "ai" };
    }
    return { questions: heuristicOutsideViewQuestions(), source: "heuristic" };
  } catch (error) {
    log.warn("outside-questions-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return { questions: heuristicOutsideViewQuestions(), source: "heuristic" };
  }
}

// Neutral framing stored in ClarityCircle.question for outside-view circles.
// The private situation is NEVER stored here, so the invite payload stays safe.
export const OUTSIDE_VIEW_FRAMING =
  "Просьба о взгляде со стороны: помогите посмотреть на ситуацию свежим, бережным взглядом.";

export interface InviteCircleLike {
  id: string;
  status: string;
  topic: string | null;
  question: string;
  inviteExpiresAt: Date;
  metadata: unknown;
  participants: { id: string }[];
}

export interface InviteSafeView {
  id: string;
  status: string;
  topic: string | null;
  question: string;
  mode: "outside" | "circle";
  outsideQuestions: string[];
  inviteExpiresAt: Date;
  participantCount: number;
  full: boolean;
}

function readOutsideMetadata(metadata: unknown): { mode: "outside" | "circle"; outsideQuestions: string[] } {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const record = metadata as Record<string, unknown>;
    const mode = record.mode === "outside" ? "outside" : "circle";
    const rawQuestions = record.outsideQuestions;
    const outsideQuestions = Array.isArray(rawQuestions)
      ? rawQuestions.filter((item): item is string => typeof item === "string")
      : [];
    return { mode, outsideQuestions };
  }
  return { mode: "circle", outsideQuestions: [] };
}

// Guest-safe projection for the invite-token endpoint: exposes only what an
// invited person needs. Strips creator antifraud hashes and every other
// participant's private answer — closing the previous over-sharing leak.
export function toInviteSafeView(circle: InviteCircleLike): InviteSafeView {
  const { mode, outsideQuestions } = readOutsideMetadata(circle.metadata);
  const participantCount = circle.participants.length;
  return {
    id: circle.id,
    status: circle.status,
    topic: circle.topic,
    question: circle.question,
    mode,
    outsideQuestions,
    inviteExpiresAt: circle.inviteExpiresAt,
    participantCount,
    full: participantCount >= 5,
  };
}
