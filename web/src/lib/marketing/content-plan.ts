/**
 * B589/B610/B578 — executable two-week editorial calendar.
 *
 * The calendar is intentionally deterministic: every slot has a stable key,
 * an exact Moscow publication time and an existing first-party destination.
 * The writer may adapt the angle after fresh research, but cannot invent a
 * destination or silently duplicate a slot.
 *
 * B700 фаза 4 — час выпуска больше НЕ живёт здесь литералом. Слот объявляет
 * класс материала, а час и ширину окна отдаёт `publish-windows.ts` из класса,
 * характера площадки и дня недели. Правило: сначала есть материал, и уже под
 * него ищется час, когда его аудитория к нему готова, — а не наоборот.
 */

import { threadsFormatFor } from "@/lib/marketing/post-formats";
import {
  publishWindow,
  type ContentClass,
  type Daypart,
} from "@/lib/marketing/publish-windows";

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
  /** B700 фаза 4: ЧТО это за материал — из него выводится окно. */
  contentClass: ContentClass;
  /** B700 фаза 4: какое время суток досталось классу на этой площадке. */
  daypart: Daypart;
  /** B700 фаза 4: сколько окно слота остаётся открытым (B645 — на класс). */
  toleranceMs: number;
  /**
   * B705 §7 — под что держится слот.
   *
   * `planned` — плановый материал, его пишет автор по теме планировщика.
   * `reactive` — слот НАМЕРЕННО оставлен пустым под ответ на всплеск, чужой
   * тред или новость дня. Забитый на 100% план физически исключает лучший
   * контент: реактивному материалу некуда встать, и он не выходит вовсе.
   */
  reserve: SlotReserve;
  /** B700 фазы 9–10: структурированный бриф (план структуры). */
  outline?: readonly string[];
  /** B700 фазы 9–10: ключевые тезисы для раскрытия в материале. */
  keyPoints?: readonly string[];
  /**
   * B733 — ТРЕБОВАНИЯ ФОРМАТА, которые сильнее общей рубрики.
   *
   * Пост-шутка не обязан нести пользу и призыв. Без явной строки об этом в
   * задаче редактор режет его по своей рубрике — и ровно это делало ленту
   * ровной. Правила уходят И автору, И редактору одной строкой реестра.
   */
  formatRules?: readonly string[];
  /**
   * B733 — нужна ли формату картинка. `none` означает, что материал выходит
   * ТЕКСТОМ: владелец 2026-09-08 — «посты в Threads не обязательно вообще
   * должны иметь скриншоты».
   */
  formatMedia?: "none" | "chat_mockup" | "art";
}

export type SlotReserve = "planned" | "reactive";

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

/**
 * B700 фаза 4 — у формата появился КЛАСС, и он третьим полем, а не заголовком.
 *
 * Названия форматов не тронуты намеренно: они лежат в `notes` уже созданных
 * строк реестра, и по ним `nextSlotCandidates` (B645) подбирает слот при
 * переносе. Переименовать формат значило бы разорвать перенос у всего, что уже
 * в работе.
 *
 * Слово «утренняя»/«дневная»/«вечерняя» внутри названия осталось от прежней
 * привязки к литеральному часу. Теперь время суток определяет класс, и на
 * выходных «утренняя карточка» выйдет в 10:00, а не в 08:30 — название говорит
 * о характере материала, а не о минуте на часах.
 */
type FormatSpec = readonly [format: string, editorialAngle: string, contentClass: ContentClass];

const TELEGRAM_FORMATS: readonly FormatSpec[] = [
  ["утренняя символическая карточка", "мягкий символ дня без предсказания", "card"],
  ["дневная мини-практика", "один наблюдаемый жизненный вопрос и действие на 2 минуты", "practice"],
  ["вечерняя мистическая история", "короткая история с открытым вопросом, а не готовой моралью", "story"],
];
// B733 — форматы Threads переехали в `post-formats.ts`: там у каждого своя
// конструкция, свой вес и СВОИ требования (пост-шутке не нужны польза и CTA).
// Двух форматов «короткое наблюдение» и «вопрос для разговора» на всю ленту и
// давали тот самый один сценарий, из-за которого лучший пост за 30 суток
// набрал 66 просмотров.
const INSTAGRAM_FORMATS: readonly FormatSpec[] = [
  ["визуальная карточка", "одна сильная мысль, сохраняемый вывод и предметный caption", "card"],
  ["мини-разбор", "сцена, объяснение и один применимый шаг без псевдонаучных обещаний", "explainer"],
];
const VK_FORMATS: readonly FormatSpec[] = [
  ["полезный пост", "понятное объяснение и один применимый шаг", "explainer"],
  ["пост-обсуждение", "узнаваемая ситуация и конкретный вопрос аудитории", "discussion"],
];

function scheduledAt(date: string, timeMoscow: string) {
  return `${date}T${timeMoscow}:00+03:00`;
}

function keyDate(date: string) {
  return date.replaceAll("-", "");
}

export const TOPIC_COUNT = TOPICS.length;

function topicAt(index: number, offset = 0) {
  // Остаток может быть отрицательным для дат до эпохи — приводим в диапазон.
  const size = TOPICS.length;
  return TOPICS[(((index + offset) % size) + size) % size];
}

/**
 * B686 — номер календарных суток, а не позиция дня в окне.
 *
 * План пересобирается каждый заход и всегда «от завтра», поэтому позиция дня
 * внутри окна у одной и той же даты каждый день другая, а `sequence` каждый
 * раз начинается с нуля. Из-за этого Дзену пожизненно доставались одни и те же
 * шесть тем из шестнадцати — и три статьи про карту Смерть в очереди были не
 * промахом модели, а прямым следствием расписания.
 */
function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/**
 * День недели московских суток.
 *
 * Полдень, а не полночь: `${date}T00:00:00+03:00` — это 21:00 UTC ПРЕДЫДУЩЕГО
 * дня, и `getUTCDay()` вернул бы вчерашний день недели. Ошибка на день здесь
 * молча превратила бы пятницу в выходной для всего плана.
 */
function moscowWeekday(date: string): number {
  return new Date(`${date}T12:00:00+03:00`).getUTCDay();
}

/**
 * B705 §7 — ГОРИЗОНТ ПЛАНИРОВАНИЯ РАЗНЫЙ У РАЗНЫХ ЛЕНТ.
 *
 * Требование владельца — «максимум неделя, чтобы не жечь токены». Окно ПЛАНА
 * токены не жжёт: их жгла генерация, шедшая по всему окну, и её ограничивает
 * `MARKETING_GENERATION_LEAD_MS` (30 часов, B625). Но вывод владельца верен по
 * другой причине: тема, придуманная для быстрой ленты десять дней назад, к
 * выпуску мертва, а статья Дзена собирает показы месяцами и требует подготовки.
 *
 * Поэтому горизонт — свойство ленты, а не общая константа: неделя быстрым
 * лентам, две Дзену, три недели Reddit (2 материала в месяц, готовятся долго).
 */
export const PLAN_HORIZON_DAYS: Record<PlanChannel, number> = {
  telegram: 7,
  threads: 7,
  vk: 7,
  instagram: 7,
  dzen: 14,
  reddit: 21,
};

export const PLAN_MAX_HORIZON_DAYS = Math.max(...Object.values(PLAN_HORIZON_DAYS));

/** Ленты, которые живут «сегодняшним днём»: у них горизонт неделя и резерв. */
const FAST_FEEDS: readonly PlanChannel[] = ["telegram", "threads", "vk", "instagram"];

/**
 * B705 §7 — 30% слотов быстрых лент остаются пустыми под реактив.
 *
 * Доля берётся детерминированно от НОМЕРА СУТОК и порядкового номера слота:
 * три из десяти. Случайность здесь недопустима — план обязан быть одинаковым
 * при каждом пересчёте, иначе слот то появляется, то исчезает.
 */
/**
 * B713 — доля выставлена в НОЛЬ по решению владельца 2026-08-17.
 *
 * Резерв держал 30% слотов быстрых лент пустыми под реакцию на события. За
 * 03.08–17.08 реактивный контур не дал НИ ОДНОГО материала, то есть каждая
 * третья возможность выпуска просто не использовалась — при том что владелец
 * видел «постов стало реже».
 *
 * ⚠ МЕХАНИЗМ НЕ УДАЛЁН НАМЕРЕННО. Он понадобится, когда реактивный контур
 * заработает, и вернуть его тогда — это правка одного числа, а не восстановление
 * удалённого кода. Ноль здесь — принятое решение, а не пропажа.
 */
const RESERVE_CYCLE = 10;
const RESERVE_SHARE = 0;

function slotReserve(channel: PlanChannel, date: string, sequence: number): SlotReserve {
  if (!FAST_FEEDS.includes(channel)) return "planned";
  // Множитель 7 расцепляет соседние сутки: без него резерв ложился бы полосами.
  const position = (((dayNumber(date) * 7 + sequence) % RESERVE_CYCLE) + RESERVE_CYCLE) % RESERVE_CYCLE;
  return position < RESERVE_SHARE ? "reactive" : "planned";
}

/**
 * Сколько слотов у площадки в КАЛЕНДАРНЫХ СУТКАХ.
 *
 * ⚠ Считается от номера суток, а не от позиции дня в окне плана. Прежние
 * списки вида `[1, 3, 5, 8, 10, 12]` были позициями в скользящем окне, и это
 * ровно тот же дефект, который B686 нашёл у ТЕМ: окно пересобирается «от
 * завтра» каждый заход, поэтому одна и та же дата за две недели успевает
 * побывать на каждой позиции и получить слот от каждого списка.
 *
 * Замер 2026-08-12 (прогон `contentPlanFor` за 21 подряд идущие сутки):
 * объявленные «Дзен 6 раз за две недели» и «Reddit 2 раза за две недели» на
 * деле давали ежедневный слот на КАЖДОЙ из шести площадок. Расписание говорило
 * одно, а конвейер получал другое.
 *
 * Числа взяты из §9: 5–8 материалов в сутки по всему флоту при приоритете
 * площадок Дзен → VK → Telegram → Instagram → Threads → Reddit. Сумма ниже —
 * около 6,5 в сутки, из них один тяжёлый.
 */
function slotsPerDay(channel: PlanChannel, date: string): number {
  const day = dayNumber(date);
  const every = (n: number) => (((day % n) + n) % n === 0 ? 1 : 0);
  switch (channel) {
    // B713 — три, а не два: `publish-windows.ts` знает у Telegram утро, день и
    // поздний вечер, а план выдавал два слота. Расписание окон и расписание
    // плана разошлись МОЛЧА, и третья строка каждые сутки снималась гигиеной
    // очереди («слот снят из контент-плана») — 72 таких снятия за две недели,
    // больше, чем по любой другой причине. Решение владельца 2026-08-17.
    case "telegram": return 3;
    /**
     * B733 — РАСПИСАНИЕ THREADS НЕРОВНОЕ.
     *
     * Требование владельца 2026-09-08: пост не должен выходить «по одному и
     * тому же расписанию». Живой аккаунт пишет то дважды за день, то один раз,
     * и ровная сетка «две штуки каждые сутки» сама по себе читается как бот.
     *
     * ⚠ Больше двух в сутки поставить НЕЛЬЗЯ: у Threads в `publish-windows.ts`
     * объявлены два времени суток (день и вечер), и третий слот молча
     * исчезал бы в `publishWindow → null`. Ровно этот разрыв между таблицей
     * окон и планом B713 нашёл у Telegram — 72 снятия слота за две недели.
     */
    case "threads": return (((day % 3) + 3) % 3) === 0 ? 1 : 2;
    case "vk": return 1;
    case "dzen": return 1;
    case "instagram": return every(2);
    case "reddit": return every(14);
  }
}

export function defaultSlotOutline(cluster: string, format: string): readonly string[] {
  if (/диалог|разбор переписки|разбор кейса/i.test(format)) {
    return [
      "1. Цитата или фрагмент ситуации клиента",
      "2. Скрытый психологический подтекст происходящего",
      "3. Типичная ошибка реакции и альтернативный шаг",
    ];
  }
  if (/вопрос-ответ|q&a/i.test(format)) {
    return [
      "1. Острый жизненный вопрос от первого лица",
      "2. Что на самом деле стоит за этим переживанием",
      "3. Практический ориентир для самопроверки",
    ];
  }
  return [
    "1. Жизненная точка напряжения без назидательности",
    "2. Внутренний механизм и почему уговоры не работают",
    "3. Спокойный фокус внимания для выхода из тупика",
  ];
}

export function defaultSlotKeyPoints(cluster: string, targetQuery: string): readonly string[] {
  return [
    `Фокус на запросе «${targetQuery}» из темы «${cluster}».`,
    "Живая человеческая интонация куратора без штампов («разложим по полочкам», «давайте разберемся»).",
    "Ясный переход к самостоятельной рефлексии без навязывания продажи.",
  ];
}

function slot(input: {
  channel: PlanChannel;
  date: string;
  time: string;
  topic: Topic;
  sequence: number;
  format: string;
  editorialAngle: string;
  contentClass: ContentClass;
  daypart: Daypart;
  toleranceMs: number;
  order: number;
  /** B733 — требования формата, которые сильнее общей рубрики редактора. */
  formatRules?: readonly string[];
  formatMedia?: "none" | "chat_mockup" | "art";
}): ContentPlanSlot {
  return {
    key: `b610-2w-${input.channel}-${keyDate(input.date)}-${String(input.sequence).padStart(2, "0")}`,
    reserve: slotReserve(input.channel, input.date, input.sequence),
    channel: input.channel,
    cluster: input.topic.cluster,
    articleSlug: input.topic.articleSlug,
    targetQuery: input.topic.targetQuery,
    order: input.order,
    scheduledAt: scheduledAt(input.date, input.time),
    format: input.format,
    editorialAngle: input.editorialAngle,
    contentClass: input.contentClass,
    daypart: input.daypart,
    toleranceMs: input.toleranceMs,
    outline: defaultSlotOutline(input.topic.cluster, input.format),
    keyPoints: defaultSlotKeyPoints(input.topic.cluster, input.topic.targetQuery),
    ...(input.formatRules ? { formatRules: input.formatRules } : {}),
    ...(input.formatMedia ? { formatMedia: input.formatMedia } : {}),
  };
}

function buildPlan(dates: readonly string[]): ContentPlanSlot[] {
  const result: ContentPlanSlot[] = [];
  let order = 1;

  /**
   * Занятые времена суток по паре «площадка + день». Считается по ходу
   * сборки, а не заранее: второй материал одного класса в один день должен
   * увидеть, что первый уже занял своё время суток, и уйти в следующее.
   */
  const takenDayparts = new Map<string, Daypart[]>();

  const push = (input: Omit<Parameters<typeof slot>[0], "order" | "time" | "daypart" | "toleranceMs">) => {
    const takenKey = `${input.channel}:${input.date}`;
    const taken = takenDayparts.get(takenKey) ?? [];
    const window = publishWindow({
      platform: input.channel,
      contentClass: input.contentClass,
      weekday: moscowWeekday(input.date),
      taken,
      // B718: зерно джиттера — площадка и КАЛЕНДАРНЫЕ сутки, а не позиция дня
      // в окне. Позиция у одной и той же даты меняется каждый заход (план
      // всегда «от завтра»), и час слота ездил бы туда-сюда — ровно тот дефект,
      // который B686 нашёл у выбора тем.
      jitterSeed: `${input.channel}:${input.date}`,
    });
    // У площадки не осталось свободного времени суток. Молчаливый второй пост
    // в тот же час читается как сбой, поэтому слот не создаётся вовсе — и это
    // видно в числе слотов плана. Для нынешних таблиц случай недостижим, что
    // держит отдельная проверка в тестах.
    if (!window) return;
    takenDayparts.set(takenKey, [...taken, window.daypart]);
    result.push(slot({
      ...input,
      order,
      time: window.time,
      daypart: window.daypart,
      toleranceMs: window.toleranceMs,
    }));
    order += 1;
  };

  /** Даты, попадающие в горизонт этой ленты. */
  const datesFor = (channel: PlanChannel) => dates.slice(0, PLAN_HORIZON_DAYS[channel]);

  datesFor("telegram").forEach((date) => {
    const day = dayNumber(date);
    for (let sequence = 0; sequence < slotsPerDay("telegram", date); sequence++) {
      // Формат берётся от номера суток: у ленты три формата на два слота, и без
      // сдвига по дню третий не выходил бы никогда.
      const [format, editorialAngle, contentClass] =
        TELEGRAM_FORMATS[(((day + sequence) % TELEGRAM_FORMATS.length) + TELEGRAM_FORMATS.length) % TELEGRAM_FORMATS.length];
      push({
        channel: "telegram",
        date,
        topic: topicAt(day * 3 + sequence),
        sequence: sequence + 1,
        format,
        editorialAngle,
        contentClass,
      });
    }
  });

  datesFor("threads").forEach((date) => {
    const day = dayNumber(date);
    for (let sequence = 0; sequence < slotsPerDay("threads", date); sequence++) {
      const chosen = threadsFormatFor(day, sequence);
      push({
        channel: "threads",
        date,
        topic: topicAt(day * 2 + sequence, 5),
        sequence: sequence + 1,
        format: chosen.label,
        editorialAngle: chosen.construction,
        contentClass: chosen.contentClass,
        formatRules: chosen.rules,
        formatMedia: chosen.media,
      });
    }
  });

  datesFor("instagram").forEach((date) => {
    const day = dayNumber(date);
    for (let sequence = 0; sequence < slotsPerDay("instagram", date); sequence++) {
      const [format, editorialAngle, contentClass] =
        INSTAGRAM_FORMATS[(((day + sequence) % INSTAGRAM_FORMATS.length) + INSTAGRAM_FORMATS.length) % INSTAGRAM_FORMATS.length];
      push({
        channel: "instagram",
        date,
        topic: topicAt(day, 8),
        sequence: sequence + 1,
        format,
        editorialAngle,
        contentClass,
      });
    }
  });

  datesFor("vk").forEach((date) => {
    const day = dayNumber(date);
    for (let sequence = 0; sequence < slotsPerDay("vk", date); sequence++) {
      const [format, editorialAngle, contentClass] =
        VK_FORMATS[(((day + sequence) % VK_FORMATS.length) + VK_FORMATS.length) % VK_FORMATS.length];
      push({
        channel: "vk",
        date,
        topic: topicAt(day, 2),
        sequence: sequence + 1,
        format,
        editorialAngle,
        contentClass,
      });
    }
  });

  datesFor("dzen").forEach((date) => {
    for (let sequence = 0; sequence < slotsPerDay("dzen", date); sequence++) {
      push({
        channel: "dzen",
        date,
        topic: topicAt(dayNumber(date), 4),
        sequence: sequence + 1,
        format: "структурированная статья",
        editorialAngle: "ответ читателю, объяснение, примеры, практический шаг и честный мягкий CTA",
        contentClass: "article",
      });
    }
  });

  datesFor("reddit").forEach((date) => {
    for (let sequence = 0; sequence < slotsPerDay("reddit", date); sequence++) {
      push({
        channel: "reddit",
        date,
        topic: topicAt(dayNumber(date), 6),
        sequence: sequence + 1,
        format: "community discussion",
        editorialAngle: "полезная самостоятельная дискуссия без рекламного лида; ссылка только после полной пользы и с раскрытием аффилированности",
        contentClass: "discussion",
      });
    }
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
 * Every daily generator run keeps the next complete Moscow days in the
 * registry. This extends the calendar in the background without changing keys
 * of already-created rows or requiring a deploy.
 *
 * B705 §7: длина окна — самый дальний горизонт (три недели у Reddit), но
 * каждая лента получает слоты только внутри СВОЕГО горизонта.
 */
export function contentPlanFor(now: Date): readonly ContentPlanSlot[] {
  const tomorrowMoscow = new Date(`${moscowIsoDate(now)}T09:00:00.000Z`);
  tomorrowMoscow.setUTCDate(tomorrowMoscow.getUTCDate() + 1);
  const dates = Array.from({ length: PLAN_MAX_HORIZON_DAYS }, (_, index) => {
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

/**
 * Свободные слоты под ПЛАНОВЫЙ материал.
 *
 * Слоты резерва сюда не попадают: их держат пустыми намеренно (§7). Материал
 * реактивной темы занимает их отдельно — см. `reactivePlanSlots`.
 */
export function nextPlanSlots(
  takenKeys: Iterable<string>,
  limit: number,
  plan: readonly ContentPlanSlot[] = CONTENT_PLAN,
): ContentPlanSlot[] {
  const taken = new Set(takenKeys);
  return plan
    .filter((entry) => entry.reserve === "planned" && !taken.has(entry.key))
    .slice(0, Math.max(0, limit));
}

/**
 * Свободные слоты РЕЗЕРВА — те, куда встаёт ответ на всплеск.
 *
 * Отдельная функция, а не флаг у предыдущей, намеренно: плановый проход не
 * должен получить их «случайно», забыв аргумент. Пустой резерв в конце суток —
 * это не потеря: значит, реактивной темы не случилось.
 */
export function reactivePlanSlots(
  takenKeys: Iterable<string>,
  plan: readonly ContentPlanSlot[] = CONTENT_PLAN,
): ContentPlanSlot[] {
  const taken = new Set(takenKeys);
  return plan.filter((entry) => entry.reserve === "reactive" && !taken.has(entry.key));
}

/**
 * B686 — слот с уже занятой темой получает свободную, а не становится дублем.
 *
 * Правило владельца: «если произошла ошибка в генерации контента, значит весь
 * дублирующий контент нужно заменить новым». Заменяется именно ТЕМА — адрес
 * слота, время и формат остаются, иначе подмена сдвинула бы расписание канала.
 *
 * Возвращает `null`, когда свободных тем не осталось: молчаливый дубль хуже
 * пропущенного слота, а пропуск виден в журнале и в счётчике плана.
 */
export function withUnusedTopic(
  slot: ContentPlanSlot,
  usedArticleSlugs: ReadonlySet<string>,
): ContentPlanSlot | null {
  if (!usedArticleSlugs.has(slot.articleSlug)) return slot;
  // Перебор начинается от собственной темы слота, а не с начала списка: так
  // соседние слоты не сходятся на одной и той же «первой свободной».
  const start = TOPICS.findIndex((topic) => topic.articleSlug === slot.articleSlug);
  for (let step = 1; step <= TOPICS.length; step++) {
    const candidate = TOPICS[(start + step) % TOPICS.length];
    if (usedArticleSlugs.has(candidate.articleSlug)) continue;
    return {
      ...slot,
      cluster: candidate.cluster,
      articleSlug: candidate.articleSlug,
      targetQuery: candidate.targetQuery,
    };
  }
  return null;
}

/**
 * B686 — по какой теме сделана уже существующая строка реестра.
 *
 * В строке лежат `targetQuery` и `cluster`, но не сам `articleSlug`: адрес
 * статьи хранится целиком в `destinationUrl` вместе с UTM-метками, и разбирать
 * его обратно значило бы зависеть от формы ссылки. Запрос — точное поле темы,
 * кластер — запасной ключ для строк, заведённых до появления `targetQuery`.
 */
export function topicArticleSlug(row: {
  targetQuery?: string | null;
  cluster?: string | null;
}): string | null {
  const byQuery = row.targetQuery?.trim().toLowerCase();
  if (byQuery) {
    const topic = TOPICS.find((entry) => entry.targetQuery.toLowerCase() === byQuery);
    if (topic) return topic.articleSlug;
  }
  const byCluster = row.cluster?.trim().toLowerCase();
  if (byCluster) {
    const topic = TOPICS.find((entry) => entry.cluster.toLowerCase() === byCluster);
    if (topic) return topic.articleSlug;
  }
  return null;
}
