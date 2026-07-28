/**
 * B589 фаза 1 · Контент-план как ДАННЫЕ, а не документ.
 *
 * План B578 живёт в сайдкар-документе — воркер его прочитать не может, и
 * поэтому маршрут держался только на том, что кто-то откроет файл и вспомнит.
 * Здесь тот же план в виде списка слотов: у каждого канал, кластер и статья, на
 * которую пост ссылается.
 *
 * ⚠ ПОСТ ВСЕГДА ССЫЛАЕТСЯ НА СУЩЕСТВУЮЩУЮ СТРАНИЦУ. Пост без страницы не даёт
 * ни индексации, ни перехода — он просто исчезает в ленте. Поэтому слот держит
 * слаг карточки библиотеки, и прогон сверяет каждый слаг с каталогом: слот,
 * указывающий в никуда, обязан падать у нас, а не у читателя.
 *
 * ⚠ КЛЮЧ СЛОТА НЕИЗМЕНЕН. По нему стоит уникальный индекс в реестре — он и не
 * даёт генератору занять слот дважды при повторном тике воркера. Менять ключ
 * существующего слота значит выпустить второй такой же пост.
 */

export type PlanChannel = "vk" | "telegram";

export interface ContentPlanSlot {
  /** Неизменяемый ключ. Уникален в реестре — защита от повторной генерации. */
  key: string;
  channel: PlanChannel;
  /** Кластер ядра B547 — по нему потом сверяется покрытие. */
  cluster: string;
  /** Слаг карточки библиотеки, на которую ведёт пост. */
  articleSlug: string;
  /** Замеренный запрос, ради которого слот существует. */
  targetQuery: string;
  /** Порядок выпуска. Меньше — раньше. */
  order: number;
  /** Явная дата для отдельных редакционных серий. */
  scheduledAt?: string;
}

/** Первая волна выходит по понедельникам в 12:00 МСК, не чаще раза в неделю. */
export const CONTENT_PLAN_START_AT = new Date("2026-08-03T09:00:00.000Z");
const WEEK_MS = 7 * 86_400_000;

export function plannedAtFor(slot: Pick<ContentPlanSlot, "order" | "scheduledAt">): Date {
  if (slot.scheduledAt) return new Date(slot.scheduledAt);
  return new Date(CONTENT_PLAN_START_AT.getTime() + (slot.order - 1) * WEEK_MS);
}

/**
 * Первая волна: восемь слотов под замеренный спрос B601 части 3.
 *
 * Первая восьмёрка сохраняет исходную SEO-волну для VK и Telegram. Вторая —
 * отдельная редакционная серия Telegram Mini App: сны, символические практики
 * и истории, которые полезны без персонального гадания и без перехода по CTA.
 */
export const CONTENT_PLAN: readonly ContentPlanSlot[] = [
  {
    key: "b589-w1-vk-vernetsya-li-byvshiy",
    channel: "vk",
    cluster: "расставание и возврат",
    articleSlug: "vernetsya-li-byvshiy-ili-ya-zhdu-zrya",
    targetQuery: "вернётся ли бывший",
    order: 1,
  },
  {
    key: "b589-w1-vk-kak-perezhit-rasstavanie",
    channel: "vk",
    cluster: "расставание и возврат",
    articleSlug: "kak-perezhit-rasstavanie-s-lyubimym",
    targetQuery: "как пережить расставание",
    order: 2,
  },
  {
    key: "b589-w1-tg-ne-mogu-zabyt-byvshego",
    channel: "telegram",
    cluster: "расставание и возврат",
    articleSlug: "ne-mogu-zabyt-byvshego-god-spustya",
    targetQuery: "не могу забыть бывшего",
    order: 3,
  },
  {
    key: "b589-w1-vk-budem-li-my-vmeste",
    channel: "vk",
    cluster: "будущее отношений",
    articleSlug: "budem-li-my-vmeste-ili-eto-tupik",
    targetQuery: "будем ли мы вместе",
    order: 4,
  },
  {
    key: "b589-w1-vk-stoit-li-uvolnyatsya",
    channel: "vk",
    cluster: "работа и выбор",
    articleSlug: "stoit-li-uvolnyatsya-ili-eto-vygoranie",
    targetQuery: "стоит ли увольняться",
    order: 5,
  },
  {
    key: "b589-w1-vk-vygoranie-na-rabote",
    channel: "vk",
    cluster: "работа и выбор",
    articleSlug: "vygoranie-na-rabote-nichego-ne-pomogaet",
    targetQuery: "выгорание на работе",
    order: 6,
  },
  {
    key: "b589-w1-tg-mne-ochen-odinoko",
    channel: "telegram",
    cluster: "одиночество",
    articleSlug: "mne-ochen-odinoko-hotya-vokrug-lyudi",
    targetQuery: "мне очень одиноко",
    order: 7,
  },
  {
    key: "b589-w1-vk-ne-mogu-nayti-sebya",
    channel: "vk",
    cluster: "поиск себя",
    articleSlug: "ne-mogu-nayti-sebya-posle-tridtsati",
    targetQuery: "не могу найти себя",
    order: 8,
  },
  {
    key: "b589-tg-channel-dreams-water",
    channel: "telegram",
    cluster: "сны и символы",
    articleSlug: "snitsya-voda-zalivaet-dom",
    targetQuery: "к чему снится вода",
    order: 9,
    scheduledAt: "2026-07-28T09:00:00.000Z",
  },
  {
    key: "b589-tg-channel-tarot-death",
    channel: "telegram",
    cluster: "Таро без фатализма",
    articleSlug: "vypala-karta-smert-na-otnosheniya",
    targetQuery: "карта смерть значение",
    order: 10,
    scheduledAt: "2026-08-01T09:00:00.000Z",
  },
  {
    key: "b589-tg-channel-zodiac-not-me",
    channel: "telegram",
    cluster: "астрология и самонаблюдение",
    articleSlug: "opisanie-znaka-zodiaka-na-menya-ne-pohozhe",
    targetQuery: "характер знаков зодиака",
    order: 11,
    scheduledAt: "2026-08-05T09:00:00.000Z",
  },
  {
    key: "b589-tg-channel-dream-house",
    channel: "telegram",
    cluster: "мистические истории о снах",
    articleSlug: "snitsya-odin-i-tot-zhe-neznakomyi-dom",
    targetQuery: "повторяющийся сон про дом",
    order: 12,
    scheduledAt: "2026-08-08T09:00:00.000Z",
  },
  {
    key: "b589-tg-channel-matrix-program",
    channel: "telegram",
    cluster: "матрица судьбы без страха",
    articleSlug: "v-matrice-sudby-nashla-negativnuyu-programmu",
    targetQuery: "негативная программа матрица судьбы",
    order: 13,
    scheduledAt: "2026-08-12T09:00:00.000Z",
  },
  {
    key: "b589-tg-channel-tarot-repeat",
    channel: "telegram",
    cluster: "истории и совпадения Таро",
    articleSlug: "odna-karta-taro-vypadaet-tri-raza",
    targetQuery: "повторяется одна карта таро",
    order: 14,
    scheduledAt: "2026-08-15T09:00:00.000Z",
  },
  {
    key: "b589-tg-channel-dream-falling",
    channel: "telegram",
    cluster: "сны и ощущения тела",
    articleSlug: "padaju-vo-sne-i-prosypayus-ot-straha",
    targetQuery: "падать во сне",
    order: 15,
    scheduledAt: "2026-08-19T09:00:00.000Z",
  },
  {
    key: "b589-tg-channel-compatibility-story",
    channel: "telegram",
    cluster: "истории о совместимости",
    articleSlug: "nizkaya-sovmestimost-po-date-no-my-schastlivy",
    targetQuery: "совместимость по дате рождения",
    order: 16,
    scheduledAt: "2026-08-22T09:00:00.000Z",
  },
] as const;

export function planSlot(key: string): ContentPlanSlot | undefined {
  return CONTENT_PLAN.find((slot) => slot.key === key);
}

/** Слоты в порядке выпуска, без уже занятых. */
export function nextPlanSlots(takenKeys: Iterable<string>, limit: number): ContentPlanSlot[] {
  const taken = new Set(takenKeys);
  return [...CONTENT_PLAN]
    .filter((slot) => !taken.has(slot.key))
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.max(0, limit));
}
