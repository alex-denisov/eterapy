/**
 * B741 — ДОПИСЫВАНИЕ ТОНКИХ КАРТОЧЕК КОРПУСА.
 *
 * ЗАМЕР, РАДИ КОТОРОГО ЭТО ДЕЛАЕТСЯ (прогон гейта глубины по всему корпусу
 * 2026-09-12):
 *
 *   всего карточек Библиотеки              199
 *   проходят гейт и идут в карту сайта      27
 *   медиана собственных слов                65
 *   распределение: <100 слов — 164 карточки, 100–199 — 8, 450+ — 27
 *
 * То есть у платформы не «плохое SEO», а двадцать семь материалов. Остальные
 * сто семьдесят два — карточки по шестьдесят пять слов, за которые Яндекс и
 * снял корпус с индекса 2026-08-17. Никакая работа с запросами, скоростью и
 * разметкой этого не меняет: ранжировать нечего.
 *
 * ⚠ ПОЧЕМУ ДОПИСЫВАТЬ ДЕШЕВЛЕ, ЧЕМ ПИСАТЬ НОВОЕ. У этих адресов уже есть
 * возраст, входящие ссылки из каталога и перелинковка. Новая страница всё это
 * набирает месяцами. Одинаковая работа автора даёт в первом случае живой
 * материал на прогретом адресе, во втором — на холодном.
 *
 * ⚠ ПОЧЕМУ НЕ ПАЧКОЙ. Требование владельца 2026-09-12 дословно: «пусть агент
 * дописывает карточки, но не выпускает их массово, это может повлиять снова на
 * обход yandex webmaster в негативную сторону». Сто семьдесят две страницы,
 * ожившие за ночь, — это событие, неотличимое от генерации корпуса машиной, а
 * ровно за это корпус и сняли. Поэтому у дописывания СВОЙ суточный потолок, и
 * он меньше, чем у новых страниц.
 */

import db from "@/lib/db";
import { approvedLibraryEntries, type AnonymousLibraryEntry } from "@/data/anonymous-library";
import { libraryDepth, libraryOwnWordCount } from "@/lib/library-depth";
import { SEO_PAGE_KIND, SEO_PAGE_STATUS } from "@/lib/seo/page-kinds";

export { SEO_PAGE_KIND };

/**
 * Сколько карточек агент дописывает за московские сутки.
 *
 * Два — это примерно полтора месяца на весь тонкий корпус. Темп выбран так,
 * чтобы прирост глубины был похож на редакционную работу, а не на выгрузку:
 * у корпуса, оживающего по две страницы в день, нет дня, в который его объём
 * меняется скачком.
 */
export const SEO_BACKFILL_PER_DAY = Math.max(
  1,
  Number(process.env.SEO_BACKFILL_PER_DAY || 2),
);
export const SEO_BACKFILL_PER_DAY_KEY = "seo.backfill_per_day";
export const SEO_BACKFILL_PER_DAY_MAX = 4;

export async function seoBackfillPerDay(): Promise<number> {
  const row = await db.platformSetting
    ?.findUnique({ where: { key: SEO_BACKFILL_PER_DAY_KEY }, select: { value: true } })
    ?.catch(() => null);
  const parsed = Number(row?.value);
  if (!Number.isFinite(parsed)) return SEO_BACKFILL_PER_DAY;
  return Math.min(SEO_BACKFILL_PER_DAY_MAX, Math.max(1, Math.round(parsed)));
}

/** Карточка корпуса, которой не хватает глубины. */
export interface ThinCard {
  entry: AnonymousLibraryEntry;
  ownWords: number;
}

/**
 * Тонкие карточки в порядке, в котором их стоит дописывать.
 *
 * ⚠ ПОРЯДОК ПО `reactions`, А НЕ ПО ОБЪЁМУ. Соблазн начинать с самых коротких
 * понятен, но неверен: короткая карточка на тему, которой никто не
 * интересовался, после дописывания останется страницей, которой никто не
 * интересуется. `reactions` — единственный след живого интереса, который у
 * корпуса есть, и он собран до всякой автоматизации.
 */
export function thinCards(): ThinCard[] {
  return approvedLibraryEntries()
    .filter((entry) => !libraryDepth(entry).indexable)
    .map((entry) => ({ entry, ownWords: libraryOwnWordCount(entry) }))
    .sort((left, right) => right.entry.reactions - left.entry.reactions);
}

/**
 * Следующая карточка на дописывание, или `null`.
 *
 * Уже дописанные исключаются по строке в базе, а не по объёму: объём
 * пересчитывается по СТАТИЧЕСКОЙ записи, и дописанное тело в него не входит —
 * значит карточка бесконечно выглядела бы тонкой и переписывалась бы каждый
 * проход.
 */
export async function nextCardToBackfill(): Promise<ThinCard | null> {
  const taken = await db.seoLibraryPage
    .findMany({ where: { kind: SEO_PAGE_KIND.backfill }, select: { slug: true } })
    .catch(() => [] as Array<{ slug: string }>);
  const done = new Set(taken.map((row) => row.slug));
  return thinCards().find((card) => !done.has(card.entry.slug)) ?? null;
}

/** Сколько карточек дописано за окно. */
export async function backfilledInWindow(start: Date, end: Date): Promise<number> {
  return db.seoLibraryPage
    .count({
      where: {
        kind: SEO_PAGE_KIND.backfill,
        status: SEO_PAGE_STATUS.published,
        publishedAt: { gte: start, lt: end },
      },
    })
    .catch(() => Number.POSITIVE_INFINITY);
}

/**
 * Наложение дописанного тела на статическую карточку.
 *
 * ⚠ СТАТИЧЕСКАЯ ЗАПИСЬ ОСТАЁТСЯ ГЛАВНОЙ. Вопрос, тема, CTA и счётчик откликов
 * берутся из неё: их видели люди и проиндексировал поисковик. Дописанное
 * добавляет то, чего не было, и заменяет только то, что было заведомо
 * служебным — мета-заголовок и описание, собиравшиеся шаблоном из вопроса.
 */
export function mergeBackfill(
  entry: AnonymousLibraryEntry,
  backfill: {
    body: unknown;
    faqs: unknown;
    perspectives: string[];
    mainForkTitle: string | null;
    mainForkNote: string | null;
    metaTitle: string;
    metaDescription: string;
    publishedAt: Date | null;
  },
): AnonymousLibraryEntry {
  const body = Array.isArray(backfill.body) ? backfill.body as AnonymousLibraryEntry["body"] : undefined;
  const faqs = Array.isArray(backfill.faqs) ? backfill.faqs as AnonymousLibraryEntry["faqs"] : undefined;
  return {
    ...entry,
    ...(body && body.length > 0 ? { body } : {}),
    ...(faqs && faqs.length > 0 ? { faqs } : {}),
    ...(backfill.perspectives.length > 0 ? { perspectives: backfill.perspectives } : {}),
    ...(backfill.mainForkTitle
      ? { mainFork: { title: backfill.mainForkTitle, note: backfill.mainForkNote ?? undefined } }
      : {}),
    seo: { metaTitle: backfill.metaTitle, metaDescription: backfill.metaDescription },
    // Дата проверки — дата дописывания: страница действительно пересматривалась
    // в этот день, и заявлять общую дату корпуса было бы неправдой.
    ...(backfill.publishedAt
      ? { reviewedAt: backfill.publishedAt.toISOString().slice(0, 10) }
      : {}),
  };
}
