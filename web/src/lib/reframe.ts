import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

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

function firstLine(sourceText: string): string {
  return sourceText.trim().split(/\n+/)[0]?.trim() || "ваша ситуация";
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

export function tryParseReframe(text: string): ReframeStructured | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { angles?: unknown };
    if (!Array.isArray(raw.angles) || raw.angles.length < 4) return null;
    return raw as ReframeStructured;
  } catch {
    return null;
  }
}

// Честный (не generic) фолбэк: заземляем на первую строку запроса, но без
// диагнозов и обещаний. Используется только если ИИ недоступен.
export function heuristicReframe(sourceText: string): { text: string; metadata: Prisma.InputJsonObject } {
  const situation = firstLine(sourceText).slice(0, 160);
  const structured: ReframeStructured = {
    angles: [
      {
        id: "thoughts",
        title: "Мысли",
        subtitle: "что я себе говорю — и что из этого факт",
        facts: [
          `Вы описали это так: «${situation}».`,
          "В мыслях обычно смешаны факты и их оценка — их полезно разделить.",
        ],
        unknowns: [
          "Что здесь проверяемый факт, а что — ваша трактовка?",
          "Какие детали вы могли додумать из тревоги?",
        ],
        options: [
          "Выпишите ситуацию в двух колонках: «факты» и «мои выводы».",
          "Найдите хотя бы одно объяснение, кроме самого тревожного.",
        ],
        ask: "Если убрать оценку и оставить только факты — что останется?",
        step: "Запишите одно предложение, начиная со слов «Я точно знаю, что…».",
      },
      {
        id: "feelings",
        title: "Чувства",
        subtitle: "на какую потребность они указывают",
        facts: [
          "Сильное чувство здесь — нормальная реакция, а не ошибка.",
          "Чувство почти всегда указывает на потребность, которой сейчас мало.",
        ],
        unknowns: [
          "Какое чувство сейчас самое сильное — и оно точно про эту ситуацию?",
          "Чего вам не хватает в этой истории — опоры, понимания, признания?",
        ],
        options: [
          "Назовите чувство вслух или письменно, не объясняя его.",
          "Разрешите себе не решать всё прямо сейчас.",
        ],
        ask: "Что вы пытаетесь не чувствовать, оставаясь в этой мысли?",
        step: "Назовите одну потребность, которой сейчас мало.",
      },
      {
        id: "reframe",
        title: "Другой взгляд",
        subtitle: "как ещё можно честно на это посмотреть",
        facts: [
          "У этой ситуации есть как минимум ещё одна правдивая трактовка.",
          "Более сбалансированный взгляд — не «позитивное мышление», а честность к фактам.",
        ],
        unknowns: [
          "Что бы вы сказали близкому человеку в такой же ситуации?",
          "Как вы посмотрите на это через год?",
        ],
        options: [
          "Сформулируйте мысль мягче, но без самообмана.",
          "Допустите, что вы видите только часть картины.",
        ],
        ask: "Какая трактовка ближе к фактам и при этом меньше ранит?",
        step: "Перепишите тревожную мысль в более сбалансированную формулировку.",
      },
      {
        id: "step",
        title: "Шаг",
        subtitle: "одно маленькое безопасное действие",
        facts: [
          "Не нужно решать всё за один день.",
          "Маленький шаг лучше большого, но откладываемого.",
        ],
        unknowns: [
          "Какой минимальный шаг добавит понимания, не увеличив давление?",
        ],
        options: [
          "Назначьте конкретное время для разговора или размышления.",
          "Сделайте паузу на 24 часа и понаблюдайте за собой.",
        ],
        ask: "Какой шаг в ближайшие 48 часов ничего не разрушит, но добавит понимания?",
        step: "Выберите один пункт и поставьте дату, когда вы его сделаете.",
      },
    ],
  };
  return { text: JSON.stringify(structured), metadata: { source: "heuristic" } };
}

export async function generateReframe(input: ReframeInput): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicReframe(input.sourceText);

  const systemPrompt = [
    "Ты — ETerapy. Твой метод — КОГНИТИВНЫЙ РЕФРЕЙМИНГ (CBT cognitive reframing / restructuring) и перспектива-тейкинг.",
    "Задача: помочь человеку увидеть ОДНУ конкретную ситуацию иначе — не переубедить, не дать совет, а расширить взгляд и вернуть ему авторство решения.",
    "Верни СТРОГО валидный JSON — без markdown, без обрамляющих кавычек, без пояснений — с такой структурой:",
    '{"angles":[',
    '{"id":"thoughts","title":"Мысли","subtitle":"что я себе говорю — и что из этого факт","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."},',
    '{"id":"feelings","title":"Чувства","subtitle":"на какую потребность они указывают","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."},',
    '{"id":"reframe","title":"Другой взгляд","subtitle":"как ещё можно честно на это посмотреть","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."},',
    '{"id":"step","title":"Шаг","subtitle":"одно маленькое безопасное действие","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."}',
    "]}",
    "Содержание каждой линзы:",
    "- thoughts: бережно раздели автоматические мысли и факты; мягко отметь типичные искажения (катастрофизация, чтение мыслей, всё-или-ничего), НЕ ставя диагноз.",
    "- feelings: назови вероятное чувство и потребность за ним; чувство — это информация, а не ошибка.",
    "- reframe: дай 1–3 АЛЬТЕРНАТИВНЫЕ, более сбалансированные и правдивые трактовки ситуации — это и есть сам рефрейм; не «позитивное мышление», а честность к фактам. Без мистики и предсказаний.",
    "- step: 1–3 маленьких безопасных действия на ближайшие 24–72 часа.",
    "Правила: каждый facts/unknowns/options — 2–4 пункта, простыми русскими фразами, БЕЗ markdown внутри строк. Опирайся на КОНКРЕТНЫЕ слова и детали пользователя, не на общие места. Тёплый тон, без диагнозов, без фатализма, без обещаний результата, без замены медицинской/юридической/финансовой помощи. Если тема про острый риск для жизни — мягко верни к живой помощи внутри JSON.",
  ].join("\n");

  try {
    const response = await aiComplete({
      feature: "product-reframe",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 2400,
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            input.contextNote ? `Контекст:\n${input.contextNote}` : "",
            "Ситуация для переосмысления:",
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
    // Нормализуем порядок линз на случай, если модель переставила их.
    parsed.angles.sort((a, b) => ANGLE_ORDER.indexOf(a.id) - ANGLE_ORDER.indexOf(b.id));
    return {
      text: JSON.stringify(parsed),
      metadata: {
        source: "ai",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
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
