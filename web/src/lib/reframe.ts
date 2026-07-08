import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { REFRAME_SYSTEM_PROMPT } from "@/lib/reframe-prompt";

export { REFRAME_SYSTEM_PROMPT };

// B441 (M28): «Переосмысление» (reframe) — самодостаточная услуга на методе
// КОГНИТИВНОГО РЕФРЕЙМИНГА (CBT cognitive reframing / restructuring +
// perspective-taking). Контекст приходит как свободный текст ситуации (+ опц.
// заметка из чипов), БЕЗ первичного диалога/checkin. Результат — четыре линзы:
//   thoughts → мысли против фактов (проверка автоматических мыслей/искажений)
//   feelings → на какую потребность указывает чувство
//   reframe  → другой, более сбалансированный взгляд (сам рефрейм)
//   step     → один маленький конкретный шаг
// Схема угла (facts/unknowns/options/ask/step) сохранена ради существующего UI.

export type ReframeAngleId = "thoughts" | "feelings" | "reframe" | "step";

export type ReframeAngle = {
  id: ReframeAngleId;
  title: string;
  subtitle: string;
  facts: string[];
  unknowns: string[];
  options: string[];
  ask: string;
  step: string;
};

export type ReframeStructured = {
  angles: ReframeAngle[];
};

export type ReframeInput = {
  /** Свободный текст ситуации/мысли, которую пользователь хочет переосмыслить. */
  sourceText: string;
  /** Опциональная заметка из чипов («О чём: работа\nЧто сильнее: тревога»). */
  contextNote?: string;
  userId: string;
  requestId?: string;
};

const ANGLE_ORDER: ReframeAngleId[] = ["thoughts", "feelings", "reframe", "step"];
const REFRAME_STOP_WORDS = new Set([
  "была",
  "были",
  "было",
  "быть",
  "ваша",
  "ваше",
  "ваши",
  "весь",
  "всего",
  "где",
  "даже",
  "если",
  "здесь",
  "именно",
  "когда",
  "которые",
  "который",
  "меня",
  "может",
  "можно",
  "нужно",
  "очень",
  "перед",
  "после",
  "почему",
  "просто",
  "сейчас",
  "себе",
  "себя",
  "свою",
  "ситуация",
  "ситуации",
  "такая",
  "такое",
  "теперь",
  "того",
  "тоже",
  "только",
  "чего",
  "человек",
  "чтобы",
  "этому",
]);

function firstLine(sourceText: string): string {
  return sourceText.trim().split(/\n+/)[0]?.trim() || "ваша ситуация";
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function situationLine(sourceText: string, contextNote?: string | null): string {
  const source = firstLine(sourceText).slice(0, 220);
  const context = contextNote ? compactText(contextNote).slice(0, 140) : "";
  return context ? `${source} (${context})` : source;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

function sourceKeywords(sourceText: string, contextNote?: string | null): string[] {
  const words = normalizeForMatch(`${sourceText} ${contextNote ?? ""}`).match(/[a-zа-я][a-zа-я0-9-]{4,}/gi) ?? [];
  const unique: string[] = [];
  for (const word of words) {
    if (REFRAME_STOP_WORDS.has(word)) continue;
    if (unique.includes(word)) continue;
    unique.push(word);
    if (unique.length >= 14) break;
  }
  return unique;
}

export function buildReframeTitle(sourceText: string): string {
  return `Переосмысление: ${firstLine(sourceText).slice(0, 80)}`;
}

export function buildReframePreview(sourceText: string): string {
  return [
    "Переосмысление — четыре угла на одну ситуацию",
    "",
    `Ситуация: ${firstLine(sourceText).slice(0, 260)}`,
    "",
    "Полный разбор по методу когнитивного рефрейминга покажет её через:",
    "- мысли — что я себе говорю и что из этого факт;",
    "- чувства — на какую потребность они указывают;",
    "- другой взгляд — как ещё можно честно на это посмотреть;",
    "- шаг — одно маленькое безопасное действие.",
  ].join("\n");
}

export function buildReframeTeaser(sourceText: string, generatedText: string): string {
  const parsed = tryParseReframe(generatedText) ?? tryParseReframe(heuristicReframe(sourceText).text);
  const first = parsed?.angles[0];
  if (!first) return buildReframePreview(sourceText);

  const lockedTitles = parsed.angles
    .slice(1)
    .map((angle) => `- ${angle.title}: ${angle.subtitle || "откроется после оплаты"}`);
  return [
    `Бесплатный разворот: ${first.title}`,
    first.subtitle ? `Фокус: ${first.subtitle}` : "",
    "",
    "Что уже видно",
    ...(first.facts.length
      ? first.facts.map((fact) => `- ${fact}`)
      : ["- Ситуация уже достаточно конкретна, чтобы посмотреть на неё не одним способом."]),
    "",
    first.ask ? `Вопрос к себе: ${first.ask}` : "",
    first.step ? `Первый шаг: ${first.step}` : "",
    "",
    "Ещё внутри полного переосмысления",
    ...lockedTitles,
  ]
    .filter(Boolean)
    .join("\n");
}

// B446: tolerate JSON wrapped in ```fences``` or surrounded by stray prose. The
// model occasionally adds a code fence or a sentence around the object; a strict
// JSON.parse would throw it all away and we'd fall back to the static heuristic
// (which only echoes the user's text in «Мысли» and leaves the other angles
// generic). Try the raw text first, then the substring from the first «{» to the
// last «}» — same approach as chat-analysis (INC-024).
function reframeJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const sliced = trimmed.slice(start, end + 1);
    if (sliced !== trimmed) candidates.push(sliced);
  }
  return candidates;
}

export function tryParseReframe(text: string): ReframeStructured | null {
  if (!text) return null;
  for (const candidate of reframeJsonCandidates(text)) {
    try {
      const raw = JSON.parse(candidate) as { angles?: unknown };
      if (Array.isArray(raw.angles) && raw.angles.length >= 4) return raw as ReframeStructured;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? compactText(value) : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter(Boolean).slice(0, 5);
}

function normalizeCandidateAngle(raw: unknown, expectedId: ReframeAngleId, fallback: ReframeAngle): ReframeAngle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const angle = raw as Partial<Record<keyof ReframeAngle, unknown>>;
  if (angle.id !== expectedId) return null;
  return {
    id: expectedId,
    title: stringValue(angle.title) || fallback.title,
    subtitle: stringValue(angle.subtitle) || fallback.subtitle,
    facts: stringList(angle.facts),
    unknowns: stringList(angle.unknowns),
    options: stringList(angle.options),
    ask: stringValue(angle.ask),
    step: stringValue(angle.step),
  };
}

function angleText(angle: ReframeAngle): string {
  return normalizeForMatch([
    angle.title,
    angle.subtitle,
    ...angle.facts,
    ...angle.unknowns,
    ...angle.options,
    angle.ask,
    angle.step,
  ].join(" "));
}

function qualityIssuesForAngle(angle: ReframeAngle, keywords: string[]): string[] {
  const issues: string[] = [];
  if (angle.facts.length < 2) issues.push("facts_missing");
  if (angle.unknowns.length < 1) issues.push("unknowns_missing");
  if (angle.options.length < 1) issues.push("options_missing");
  if (!angle.ask) issues.push("ask_missing");
  if (!angle.step) issues.push("step_missing");

  if (keywords.length >= 2) {
    const text = angleText(angle);
    if (!keywords.some((keyword) => text.includes(keyword))) issues.push("source_anchor_missing");
  }

  return issues;
}

function fallbackStructured(sourceText: string, contextNote?: string | null): ReframeStructured {
  return tryParseReframe(heuristicReframe(sourceText, contextNote ?? undefined).text) ?? { angles: [] };
}

export function personalizeReframeResult(
  parsed: ReframeStructured,
  sourceText: string,
  contextNote?: string | null,
): { structured: ReframeStructured; repairedAngleIds: ReframeAngleId[]; qualityIssues: string[] } {
  const fallback = fallbackStructured(sourceText, contextNote);
  const fallbackById = new Map(fallback.angles.map((angle) => [angle.id, angle]));
  const rawById = new Map((parsed.angles ?? []).map((angle) => [(angle as ReframeAngle | undefined)?.id, angle]));
  const keywords = sourceKeywords(sourceText, contextNote);
  const repairedAngleIds: ReframeAngleId[] = [];
  const qualityIssues: string[] = [];

  const angles = ANGLE_ORDER.map((id) => {
    const fallbackAngle = fallbackById.get(id);
    if (!fallbackAngle) {
      repairedAngleIds.push(id);
      qualityIssues.push(`${id}:fallback_missing`);
      return {
        id,
        title: id,
        subtitle: "",
        facts: [firstLine(sourceText)],
        unknowns: ["Что здесь важно уточнить, прежде чем делать вывод?"],
        options: ["Проверьте один факт из ситуации, прежде чем действовать."],
        ask: "Какой факт я могу проверить прямо сейчас?",
        step: "Запишите один проверяемый факт и один вывод, который пока остается гипотезой.",
      };
    }

    const candidate = normalizeCandidateAngle(rawById.get(id), id, fallbackAngle);
    if (!candidate) {
      repairedAngleIds.push(id);
      qualityIssues.push(`${id}:missing_or_wrong_id`);
      return fallbackAngle;
    }

    const issues = qualityIssuesForAngle(candidate, keywords);
    if (issues.length > 0) {
      repairedAngleIds.push(id);
      qualityIssues.push(...issues.map((issue) => `${id}:${issue}`));
      return fallbackAngle;
    }

    return candidate;
  });

  return { structured: { angles }, repairedAngleIds, qualityIssues };
}

export function reframeResultForDisplay(
  resultText: string | null | undefined,
  sourceText: string | null | undefined,
  contextNote?: string | null,
): string | null {
  if (!resultText) return resultText ?? null;
  const parsed = tryParseReframe(resultText);
  if (!parsed || !sourceText?.trim()) return resultText;
  return JSON.stringify(personalizeReframeResult(parsed, sourceText, contextNote).structured);
}

// Честный (не generic) фолбэк: заземляем на первую строку запроса, но без
// диагнозов и обещаний. Используется только если ИИ недоступен.
export function heuristicReframe(sourceText: string, contextNote?: string): { text: string; metadata: Prisma.InputJsonObject } {
  const situation = situationLine(sourceText, contextNote).slice(0, 260);
  const structured: ReframeStructured = {
    angles: [
      {
        id: "thoughts",
        title: "Мысли",
        subtitle: "что я себе говорю — и что из этого факт",
        facts: [
          `В центре запроса — «${situation}». Это факт входа: именно с этой сцены начинается напряжение.`,
          "Автоматическая мысль, похоже, пытается быстро достроить вывод о том, что это значит для вас или отношений.",
          "Самый полезный разворот здесь — отделить наблюдаемое событие от вывода, который пока остается гипотезой.",
        ],
        unknowns: [
          `Что в «${situation}» точно произошло, а что вы уже объяснили за другого человека или за будущее?`,
          "Какие детали подтверждают тревожный вывод, а какие ему противоречат?",
        ],
        options: [
          "Запишите две колонки: «что я видел(а)/слышал(а)» и «какой вывод я сделал(а)».",
          "Найдите одну альтернативную причину произошедшего, которая не обвиняет вас автоматически.",
        ],
        ask: "Как звучит моя главная мысль, если честно назвать ее гипотезой, а не фактом?",
        step: "Сформулируйте одну фразу: «Я точно знаю, что...», и отдельно одну фразу: «Я пока предполагаю, что...».",
      },
      {
        id: "feelings",
        title: "Чувства",
        subtitle: "на какую потребность они указывают",
        facts: [
          `Реакция на «${situation}» может быть сильной не из-за слабости, а потому что задеты важные потребности.`,
          "Под чувством может быть потребность в уважении, предсказуемости, признании или праве не быть обесцененным(ой).",
          "Чувство здесь сообщает: «для меня это значимо», а не автоматически говорит, что худший вывод верен.",
        ],
        unknowns: [
          "Какое чувство самое громкое: злость, стыд, тревога, обида, растерянность, одиночество?",
          "Какая потребность под ним сейчас не получила места: уважение, понятные правила, поддержка, безопасность, близость?",
        ],
        options: [
          "Назовите чувство и потребность одной короткой фразой: «я чувствую..., потому что мне важно...».",
          "Перед действием проверьте: вы хотите защитить границу, получить объяснение, восстановить контакт или снизить тревогу?",
        ],
        ask: "Какую потребность я пытаюсь защитить, когда снова возвращаюсь мыслями к этой ситуации?",
        step: "Запишите одно чувство и одну потребность, прежде чем выбирать ответ или действие.",
      },
      {
        id: "reframe",
        title: "Другой взгляд",
        subtitle: "как ещё можно честно на это посмотреть",
        facts: [
          `Другой взгляд на «${situation}» не обязан оправдывать происходящее, но может убрать туннельный вывод.`,
          "Сейчас у вас есть часть картины, а не вся картина: этого достаточно для заботы о себе, но мало для окончательного вердикта.",
          "Более точная мысль может звучать так: «это неприятно и важно, но мне нужно проверить факты, прежде чем решать за всех».",
        ],
        unknowns: [
          "Какая трактовка объясняет ситуацию без самоунижения и без чтения мыслей другого человека?",
          "Что бы изменилось, если рассматривать это как сигнал к уточнению, а не как окончательное доказательство?",
        ],
        options: [
          "Перепишите тревожный вывод в форму проверяемого вопроса.",
          "Составьте одну нейтральную фразу для уточнения фактов, если разговор уместен.",
        ],
        ask: "Какая формулировка одновременно честна к фактам и не превращает меня в виноватого(ую) заранее?",
        step: "Запишите новую мысль по шаблону: «Возможно..., но я проверю это через...».",
      },
      {
        id: "step",
        title: "Шаг",
        subtitle: "одно маленькое действие",
        facts: [
          `Для «${situation}» хороший следующий шаг должен проверять один факт или защищать одну границу, а не решать всю историю сразу.`,
          "Большое решение сейчас может быть реакцией на напряжение; маленькое действие даст больше информации.",
        ],
        unknowns: [
          "Какой факт можно уточнить без давления и без попытки немедленно поставить точку?",
          "Какой шаг уменьшит хаос: разговор, пауза, черновик ответа, граница или наблюдение за триггером?",
        ],
        options: [
          "Если нужен разговор, подготовьте одну спокойную фразу с вопросом, а не обвинением.",
          "Если сейчас много эмоций, сделайте паузу и вернитесь к решению в конкретное время.",
          "Если речь о границе, сформулируйте ее коротко: что для вас неприемлемо и что вы просите вместо этого.",
        ],
        ask: "Какое одно действие в ближайшие 48 часов даст мне больше фактов или опоры, а не просто снимет напряжение на минуту?",
        step: "Выберите один вариант и запишите конкретное время, когда вы его сделаете или отправите черновик.",
      },
    ],
  };
  return { text: JSON.stringify(structured), metadata: { source: "heuristic" } };
}

export async function generateReframe(input: ReframeInput): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicReframe(input.sourceText, input.contextNote);

  try {
    const response = await aiComplete({
      feature: "product-reframe",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 5200,
      temperature: 0.55,
      messages: [
        { role: "system", content: REFRAME_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            input.contextNote ? `Контекст:\n${input.contextNote}` : "",
            "Ситуация для переосмысления (разбери все четыре угла именно под неё):",
            input.sourceText.slice(0, 6000),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const parsed = tryParseReframe(response.text.trim());
    if (!parsed) {
      return { ...fallback, metadata: { ...fallback.metadata, fallbackReason: "json_parse_failed" } };
    }
    const personalized = personalizeReframeResult(parsed, input.sourceText, input.contextNote);
    return {
      text: JSON.stringify(personalized.structured),
      metadata: {
        source: personalized.repairedAngleIds.length ? "ai_repaired" : "ai",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
        repairedAngleIds: personalized.repairedAngleIds,
        qualityIssues: personalized.qualityIssues,
      },
    };
  } catch (error) {
    log.warn("reframe-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return fallback;
  }
}
