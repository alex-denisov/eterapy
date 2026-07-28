/**
 * B589/B610/B578 — executable two-week editorial calendar.
 *
 * The calendar is intentionally deterministic: every slot has a stable key,
 * an exact Moscow publication time and an existing first-party destination.
 * The writer may adapt the angle after fresh research, but cannot invent a
 * destination or silently duplicate a slot.
 */

export type PlanChannel = "vk" | "telegram" | "threads" | "instagram" | "dzen" | "reddit";

export interface ContentPlanSlot {
  key: string;
  channel: PlanChannel;
  cluster: string;
  articleSlug: string;
  targetQuery: string;
  order: number;
  scheduledAt: string;
  format: string;
  editorialAngle: string;
}

type Topic = Pick<ContentPlanSlot, "cluster" | "articleSlug" | "targetQuery">;

const TOPICS: readonly Topic[] = [
  {
    cluster: "расставание и возврат",
    articleSlug: "vernetsya-li-byvshiy-ili-ya-zhdu-zrya",
    targetQuery: "вернётся ли бывший",
  },
  {
    cluster: "расставание и возврат",
    articleSlug: "kak-perezhit-rasstavanie-s-lyubimym",
    targetQuery: "как пережить расставание",
  },
  {
    cluster: "расставание и возврат",
    articleSlug: "ne-mogu-zabyt-byvshego-god-spustya",
    targetQuery: "не могу забыть бывшего",
  },
  {
    cluster: "будущее отношений",
    articleSlug: "budem-li-my-vmeste-ili-eto-tupik",
    targetQuery: "будем ли мы вместе",
  },
  {
    cluster: "работа и выбор",
    articleSlug: "stoit-li-uvolnyatsya-ili-eto-vygoranie",
    targetQuery: "стоит ли увольняться",
  },
  {
    cluster: "работа и выбор",
    articleSlug: "vygoranie-na-rabote-nichego-ne-pomogaet",
    targetQuery: "выгорание на работе",
  },
  {
    cluster: "одиночество",
    articleSlug: "mne-ochen-odinoko-hotya-vokrug-lyudi",
    targetQuery: "мне очень одиноко",
  },
  {
    cluster: "поиск себя",
    articleSlug: "ne-mogu-nayti-sebya-posle-tridtsati",
    targetQuery: "не могу найти себя после тридцати",
  },
  {
    cluster: "сны и символы",
    articleSlug: "snitsya-voda-zalivaet-dom",
    targetQuery: "к чему снится вода",
  },
  {
    cluster: "Таро без фатализма",
    articleSlug: "vypala-karta-smert-na-otnosheniya",
    targetQuery: "карта смерть значение",
  },
  {
    cluster: "астрология и самонаблюдение",
    articleSlug: "opisanie-znaka-zodiaka-na-menya-ne-pohozhe",
    targetQuery: "характер знаков зодиака",
  },
  {
    cluster: "мистические истории о снах",
    articleSlug: "snitsya-odin-i-tot-zhe-neznakomyi-dom",
    targetQuery: "повторяющийся сон про дом",
  },
  {
    cluster: "матрица судьбы без страха",
    articleSlug: "v-matrice-sudby-nashla-negativnuyu-programmu",
    targetQuery: "негативная программа матрица судьбы",
  },
  {
    cluster: "истории и совпадения Таро",
    articleSlug: "odna-karta-taro-vypadaet-tri-raza",
    targetQuery: "повторяется одна карта таро",
  },
  {
    cluster: "сны и ощущения тела",
    articleSlug: "padaju-vo-sne-i-prosypayus-ot-straha",
    targetQuery: "падать во сне",
  },
  {
    cluster: "истории о совместимости",
    articleSlug: "nizkaya-sovmestimost-po-date-no-my-schastlivy",
    targetQuery: "совместимость по дате рождения",
  },
] as const;

const DATES = [
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
  "2026-08-01",
  "2026-08-02",
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-08",
  "2026-08-09",
  "2026-08-10",
  "2026-08-11",
] as const;

const TELEGRAM_FORMATS = [
  ["утренняя символическая карточка", "мягкий символ дня без предсказания"],
  ["дневная мини-практика", "один наблюдаемый жизненный вопрос и действие на 2 минуты"],
  ["вечерняя мистическая история", "короткая история с открытым вопросом, а не готовой моралью"],
] as const;
const THREADS_FORMATS = [
  ["короткое наблюдение", "узнаваемая бытовая сцена с сухой самоиронией"],
  ["вопрос для разговора", "неоднозначный, но безопасный тезис, на который хочется ответить"],
] as const;
const INSTAGRAM_FORMATS = [
  ["визуальная карточка", "одна сильная мысль, сохраняемый вывод и предметный caption"],
  ["мини-разбор", "сцена, объяснение и один применимый шаг без псевдонаучных обещаний"],
] as const;
const VK_FORMATS = [
  ["полезный пост", "понятное объяснение и один применимый шаг"],
  ["пост-обсуждение", "узнаваемая ситуация и конкретный вопрос аудитории"],
] as const;

function scheduledAt(date: string, timeMoscow: string) {
  return `${date}T${timeMoscow}:00+03:00`;
}

function keyDate(date: string) {
  return date.replaceAll("-", "");
}

function topicAt(index: number, offset = 0) {
  return TOPICS[(index + offset) % TOPICS.length];
}

function slot(input: {
  channel: PlanChannel;
  date: string;
  time: string;
  topic: Topic;
  sequence: number;
  format: string;
  editorialAngle: string;
  order: number;
}): ContentPlanSlot {
  return {
    key: `b610-2w-${input.channel}-${keyDate(input.date)}-${String(input.sequence).padStart(2, "0")}`,
    channel: input.channel,
    cluster: input.topic.cluster,
    articleSlug: input.topic.articleSlug,
    targetQuery: input.topic.targetQuery,
    order: input.order,
    scheduledAt: scheduledAt(input.date, input.time),
    format: input.format,
    editorialAngle: input.editorialAngle,
  };
}

function buildPlan(dates: readonly string[]): ContentPlanSlot[] {
  const result: ContentPlanSlot[] = [];
  let order = 1;
  const push = (input: Omit<Parameters<typeof slot>[0], "order">) => {
    result.push(slot({ ...input, order }));
    order += 1;
  };

  dates.forEach((date, dayIndex) => {
    TELEGRAM_FORMATS.forEach(([format, editorialAngle], sequence) => {
      push({
        channel: "telegram",
        date,
        time: ["08:30", "13:00", "20:30"][sequence],
        topic: topicAt(dayIndex * 3 + sequence),
        sequence: sequence + 1,
        format,
        editorialAngle,
      });
    });

    THREADS_FORMATS.forEach(([format, editorialAngle], sequence) => {
      push({
        channel: "threads",
        date,
        time: ["10:45", "18:45"][sequence],
        topic: topicAt(dayIndex * 2 + sequence, 5),
        sequence: sequence + 1,
        format,
        editorialAngle,
      });
    });
  });

  const instagramDays = [0, 2, 4, 6, 7, 9, 11, 13] as const;
  instagramDays.forEach((dayIndex, sequence) => {
    const [format, editorialAngle] = INSTAGRAM_FORMATS[sequence % INSTAGRAM_FORMATS.length];
    push({
      channel: "instagram",
      date: dates[dayIndex],
      time: "12:15",
      topic: topicAt(sequence, 8),
      sequence: 1,
      format,
      editorialAngle,
    });
  });

  const vkDays = [0, 1, 3, 4, 6, 7, 8, 10, 11, 13] as const;
  vkDays.forEach((dayIndex, sequence) => {
    const [format, editorialAngle] = VK_FORMATS[sequence % VK_FORMATS.length];
    push({
      channel: "vk",
      date: dates[dayIndex],
      time: sequence % 2 === 0 ? "11:30" : "19:15",
      topic: topicAt(sequence, 2),
      sequence: 1,
      format,
      editorialAngle,
    });
  });

  const dzenDays = [1, 3, 5, 8, 10, 12] as const;
  dzenDays.forEach((dayIndex, sequence) => {
    push({
      channel: "dzen",
      date: dates[dayIndex],
      time: "09:30",
      topic: topicAt(sequence, 4),
      sequence: 1,
      format: "структурированная статья",
      editorialAngle: "ответ читателю, объяснение, примеры, практический шаг и честный мягкий CTA",
    });
  });

  [4, 11].forEach((dayIndex, sequence) => {
    push({
      channel: "reddit",
      date: dates[dayIndex],
      time: "17:00",
      topic: topicAt(sequence, 6),
      sequence: 1,
      format: "community discussion",
      editorialAngle: "полезная самостоятельная дискуссия без рекламного лида; ссылка только после полной пользы и с раскрытием аффилированности",
    });
  });

  return result.sort((left, right) =>
    new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
      || left.order - right.order
  ).map((entry, index) => ({ ...entry, order: index + 1 }));
}

export const CONTENT_PLAN_START_AT = new Date("2026-07-29T05:30:00.000Z");
export const CONTENT_PLAN_END_AT = new Date("2026-08-11T17:30:00.000Z");
export const CONTENT_PLAN: readonly ContentPlanSlot[] = buildPlan(DATES);

function moscowIsoDate(value: Date) {
  const local = new Date(value.getTime() + 3 * 60 * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Every daily generator run keeps the next fourteen complete Moscow days in
 * the registry. This extends the calendar in the background without changing
 * keys of already-created rows or requiring a deploy.
 */
export function contentPlanFor(now: Date): readonly ContentPlanSlot[] {
  const tomorrowMoscow = new Date(`${moscowIsoDate(now)}T09:00:00.000Z`);
  tomorrowMoscow.setUTCDate(tomorrowMoscow.getUTCDate() + 1);
  const dates = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(tomorrowMoscow);
    date.setUTCDate(tomorrowMoscow.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  return buildPlan(dates);
}

export function plannedAtFor(slot: Pick<ContentPlanSlot, "scheduledAt">): Date {
  return new Date(slot.scheduledAt);
}

export function planSlot(key: string): ContentPlanSlot | undefined {
  return CONTENT_PLAN.find((entry) => entry.key === key);
}

export function nextPlanSlots(
  takenKeys: Iterable<string>,
  limit: number,
  plan: readonly ContentPlanSlot[] = CONTENT_PLAN,
): ContentPlanSlot[] {
  const taken = new Set(takenKeys);
  return plan
    .filter((entry) => !taken.has(entry.key))
    .slice(0, Math.max(0, limit));
}
