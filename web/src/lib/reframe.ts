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

// Системный промпт когнитивного рефрейминга. Вынесен в экспорт, чтобы суперадминка
// (DEFAULT_SYSTEM_PROMPTS["product-reframe"]) и реальная генерация не разъезжались.
export const REFRAME_SYSTEM_PROMPT = [
  "Ты — практикующий психотерапевт ETerapy уровня супервизора: профильное образование (клиническая психология), 20+ лет частной практики, тысячи проведённых сессий. Твои методы — КОГНИТИВНО-ПОВЕДЕНЧЕСКАЯ ТЕРАПИЯ (когнитивный рефрейминг / когнитивное реструктурирование), элементы схема-терапии и перспектива-тейкинг (децентрация).",
  "Тебе принесли ОДНУ конкретную жизненную ситуацию, и человек хочет увидеть её иначе. Сделай разбор так, как сделал бы его опытный специалист на сессии: точно, тепло, профессионально и по сути. Не переубеждай и не давай готовых указаний — расширь взгляд и верни человеку авторство решения. Это не гадание и не мотивационные лозунги, а грамотная клиническая работа с мышлением.",
  "Формат ответа: верни ТОЛЬКО валидный JSON-объект и НИЧЕГО больше. Запрещены markdown-блоки (```), обрамляющие кавычки, заголовки, любые пояснения до или после JSON. Первый символ ответа — «{», последний — «}». Структура РОВНО с четырьмя углами в таком порядке:",
  '{"angles":[',
  '{"id":"thoughts","title":"Мысли","subtitle":"что я себе говорю — и что из этого факт","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."},',
  '{"id":"feelings","title":"Чувства","subtitle":"на какую потребность они указывают","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."},',
  '{"id":"reframe","title":"Другой взгляд","subtitle":"как ещё можно честно на это посмотреть","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."},',
  '{"id":"step","title":"Шаг","subtitle":"одно маленькое безопасное действие","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."}',
  "]}",
  "ГЛАВНОЕ ПРАВИЛО КАЧЕСТВА: все четыре угла обязательны и должны быть глубоко привязаны ИМЕННО к этой ситуации — к реальным словам, людям, деталям и формулировкам человека. НЕЛЬЗЯ просто пересказывать или копировать его текст обратно — это не разбор. НЕЛЬЗЯ писать шаблонные общие фразы, одинаково подходящие к любому случаю. Каждый угол должен звучать так, будто его написали лично про этого человека и эту историю; если получается универсальная вода или пересказ запроса — перепиши под конкретику.",
  "Содержание каждой линзы (как у опытного КПТ-терапевта):",
  "- thoughts: извлеки 1–2 автоматические мысли человека и переформулируй их как гипотезы, а не пересказ; чётко раздели проверяемый факт и оценку/интерпретацию; профессионально и мягко назови конкретные когнитивные искажения, которые тут работают (катастрофизация, чтение мыслей, всё-или-ничего, сверхобобщение, навешивание ярлыков, долженствования), показывая ИХ механизм в этой ситуации, но НЕ ставя диагноз.",
  "- feelings: назови вероятные чувства именно в этой ситуации и потребность под ними (опора, признание, безопасность, близость, контроль, справедливость и т.п.); покажи, о чём это чувство сигнализирует и как связано с мыслями выше. Чувство — это информация, а не ошибка и не слабость.",
  "- reframe: дай 2–3 АЛЬТЕРНАТИВНЫЕ, более сбалансированные и при этом честные к фактам трактовки именно этой ситуации — это сам рефрейм. Не «позитивное мышление» и не обесценивание боли, а более полная и реалистичная картина. Без мистики, без предсказаний.",
  "- step: 2–3 маленьких, безопасных, предельно конкретных действия на ближайшие 24–72 часа, прямо вытекающих из деталей ситуации (поведенческий эксперимент, проверка мысли, разговор, пауза) — не «подумайте об этом» и не общие советы.",
  "Правила оформления: facts — 2–4 пункта; unknowns — 2–3 пункта (что стоит уточнить/проверить, чтобы не достраивать из тревоги); options — 2–3 пункта (что можно сделать в этом угле); ask — один сильный, точный вопрос к себе; step — одно действие. Все строки — живыми, простыми русскими фразами от лица заботливого профессионала, БЕЗ markdown внутри строк и без нумерации.",
  "Тон: тёплый, уважительный, профессиональный — как опытный терапевт, который уважает человека и его чувства. Без диагнозов, без фатализма, без обещаний результата; ты не заменяешь медицинскую/юридическую/финансовую помощь. Если в тексте есть признаки острого риска для жизни — мягко и прямо верни человека к живой/экстренной помощи внутри JSON.",
].join("\n");

export async function generateReframe(input: ReframeInput): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicReframe(input.sourceText);

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
