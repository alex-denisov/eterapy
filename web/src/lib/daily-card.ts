import crypto from "node:crypto";
import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

// Each daily practice is a three-beat ritual (docs/Design/v4.2 «Практика
// ясности»): вопрос дня → ракурс дня → маленький шаг. The static templates
// below are the deterministic fallback used whenever the LLM is unavailable —
// they MUST carry all three beats so the page never renders an empty ракурс
// or шаг.
export interface DailyPracticeContent {
  title: string;
  body: string;
  prompt: string;
  perspective: string;
  step: string;
}

const CARDS: DailyPracticeContent[] = [
  {
    title: "Маленький честный шаг",
    body: "Сегодня достаточно выбрать один вопрос, который правда просит внимания.",
    prompt: "Что станет чуть легче, если я признаю это вслух?",
    perspective: "Посмотрите на ситуацию так, будто её описывает близкий друг: что в его словах вы услышали бы как разрешение позаботиться о себе?",
    step: "Скажите вслух одну фразу, которую обычно оставляете внутри. Просто чтобы услышать её своим голосом.",
  },
  {
    title: "Граница без резкости",
    body: "Можно оставаться теплой и при этом не соглашаться на то, что истощает.",
    prompt: "Где сегодня мне нужна мягкая, но ясная граница?",
    perspective: "Граница — это не стена против другого, а забота о себе. Представьте, что вы защищаете не от человека, а свой ресурс на завтра.",
    step: "Сформулируйте одну короткую фразу-границу и проговорите её про себя, без объяснений и оправданий.",
  },
  {
    title: "Пауза перед ответом",
    body: "Не каждый импульс требует немедленного действия. Иногда ясность приходит после паузы.",
    prompt: "Что изменится, если я отвечу не сразу?",
    perspective: "Посмотрите на паузу как на пространство выбора, а не на промедление. Между событием и реакцией всегда есть зазор — он ваш.",
    step: "Выберите одну ситуацию сегодня, где вы дадите себе три вдоха перед ответом.",
  },
  {
    title: "Вернуться к себе",
    body: "Внешние советы полезны только тогда, когда не заглушают внутренний голос.",
    prompt: "Какой мой собственный критерий в этой ситуации?",
    perspective: "Представьте, что все мнения вокруг стихли. Что бы вы выбрали, если бы доверяли себе чуть больше обычного?",
    step: "Запишите один критерий, который важен лично вам — не семье, не коллегам, а вам.",
  },
  {
    title: "Бережная проверка реальности",
    body: "Отделите факты от догадок. Так тревоге становится меньше места.",
    prompt: "Что я точно знаю, а что пока только предполагаю?",
    perspective: "Тревога часто склеивает факт и страх в одно. Посмотрите на них как на две разные стопки — что в какую ложится?",
    step: "Выпишите один факт и одно предположение рядом, чтобы увидеть, где заканчивается известное.",
  },
  {
    title: "Один ресурс",
    body: "Сегодня не нужно чинить всю жизнь. Найдите один источник опоры.",
    prompt: "Что даст мне плюс пять процентов спокойствия?",
    perspective: "Не ищите большое решение. Посмотрите на день как на цепочку маленьких опор — какая из них доступна прямо сейчас?",
    step: "Сделайте одно небольшое действие из заботы о себе в ближайший час.",
  },
  {
    title: "Право на ясность",
    body: "Ваш вопрос достаточно важен уже потому, что он возвращается.",
    prompt: "Какой ответ я боюсь услышать, но готова рассмотреть?",
    perspective: "Страх перед ответом часто больше самого ответа. Посмотрите на него с любопытством: что он бережёт?",
    step: "Назовите этот ответ одним предложением — не чтобы согласиться, а чтобы перестать прятать.",
  },
];

/** Read the ракурс/шаг beats out of a stored DailyCard.metadata blob. */
export function dailyCardBeats(metadata: unknown): { perspective: string | null; step: string | null } {
  if (!metadata || typeof metadata !== "object") return { perspective: null, step: null };
  const meta = metadata as Record<string, unknown>;
  return {
    perspective: typeof meta.perspective === "string" ? meta.perspective : null,
    step: typeof meta.step === "string" ? meta.step : null,
  };
}

export function dailyCardDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function cardIndex(userId: string, cardDate: Date) {
  const digest = crypto.createHash("sha256").update(`${userId}:${cardDate.toISOString()}`).digest();
  return digest[0] % CARDS.length;
}

function fallbackContent(userId: string, cardDate: Date): DailyPracticeContent {
  return CARDS[cardIndex(userId, cardDate)];
}

/**
 * Pull a light, privacy-safe seed for personalisation: the user's most recent
 * dialogue topic/title. We never send raw message bodies to the daily-practice
 * model — only the coarse theme — so the question feels relevant without
 * leaking the actual conversation.
 */
async function loadPersonalisationSeed(userId: string): Promise<string | null> {
  try {
    const recent = await db.dialogue.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { topic: true, title: true },
    });
    const seed = recent?.topic?.trim() || recent?.title?.trim() || null;
    return seed && seed.length > 0 ? seed.slice(0, 120) : null;
  } catch {
    return null;
  }
}

function parseDailyPracticeResponse(text: string): DailyPracticeContent | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const prompt = typeof raw.question === "string" ? raw.question.trim() : "";
    const body = typeof raw.body === "string" ? raw.body.trim() : "";
    const perspective = typeof raw.perspective === "string" ? raw.perspective.trim() : "";
    const step = typeof raw.step === "string" ? raw.step.trim() : "";
    if (!prompt || !body || !perspective || !step) return null;
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Практика ясности";
    return {
      title: title.slice(0, 80),
      body: body.slice(0, 400),
      prompt: prompt.slice(0, 240),
      perspective: perspective.slice(0, 400),
      step: step.slice(0, 280),
    };
  } catch {
    return null;
  }
}

/**
 * Generate the day's three-beat practice via the AI gateway. Routed through
 * the monitored `daily-practice` feature policy (configurable in the superadmin
 * AI-центр). Always returns content: on any failure it falls back to the
 * deterministic template so the daily ritual never breaks.
 */
export async function generateDailyPracticeContent(
  userId: string,
  cardDate: Date,
): Promise<{ content: DailyPracticeContent; source: "ai" | "deterministic_v1" }> {
  const fallback = fallbackContent(userId, cardDate);
  const seed = await loadPersonalisationSeed(userId);

  try {
    const response = await aiComplete({
      feature: "daily-practice",
      userId,
      maxTokens: 500,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: [
            "Ты ведёшь ежедневную «Практику ясности» в продукте ETerapy — мягком сервисе самонаблюдения.",
            "Сгенерируй один день практики из трёх частей. Верни ТОЛЬКО JSON без markdown:",
            '{"title": "...", "body": "...", "question": "...", "perspective": "...", "step": "..."}',
            "title — короткое название дня (2–4 слова).",
            "body — одно тёплое вводное предложение (до 160 символов).",
            "question — вопрос дня от первого лица, на который человек отвечает себе (до 140 символов).",
            "perspective — ракурс дня: один бережный разворот взгляда, помогающий увидеть ситуацию иначе (1–2 предложения).",
            "step — маленький шаг: одно конкретное, выполнимое за минуты действие на сегодня (1 предложение).",
            "Тон: тёплый, без диагнозов, без медицинских/юридических/финансовых советов, без кризисных тем. Только русский язык.",
          ].join(" "),
        },
        {
          role: "user",
          content: seed
            ? `Недавняя тема размышлений человека: «${seed}». Сделай практику мягко созвучной этой теме, но не цитируй её дословно.`
            : "Тема не задана — сделай универсальную практику на спокойное самонаблюдение.",
        },
      ],
    });

    const parsed = parseDailyPracticeResponse(response.text);
    if (!parsed) return { content: fallback, source: "deterministic_v1" };
    return { content: parsed, source: "ai" };
  } catch (error) {
    log.warn("daily-practice-fallback", { userId, error: serializeError(error) });
    return { content: fallback, source: "deterministic_v1" };
  }
}

export async function getOrCreateDailyCard(userId: string, now = new Date()) {
  const cardDate = dailyCardDate(now);
  const existing = await db.dailyCard.findUnique({
    where: { userId_cardDate: { userId, cardDate } },
  });
  if (existing) return { card: existing, created: false };

  const { content, source } = await generateDailyPracticeContent(userId, cardDate);
  const card = await db.dailyCard.create({
    data: {
      userId,
      cardDate,
      title: content.title,
      body: content.body,
      prompt: content.prompt,
      metadata: {
        source,
        perspective: content.perspective,
        step: content.step,
        ...(source === "deterministic_v1" ? { templateIndex: cardIndex(userId, cardDate) } : {}),
      },
    },
  });
  return { card, created: true };
}
