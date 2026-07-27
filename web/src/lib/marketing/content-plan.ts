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
}

/**
 * Первая волна: восемь слотов под замеренный спрос B601 части 3.
 *
 * Каналы расставлены не поровну: VK — единственный, где у нас есть готовое
 * сообщество и кит оформления (B603). Telegram добавлен двумя слотами, чтобы
 * адаптер второго канала проверялся на практике, а не «когда-нибудь».
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
