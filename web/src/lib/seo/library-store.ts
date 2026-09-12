/**
 * B740 — ХРАНИЛИЩЕ СТРАНИЦ, ВЫПУЩЕННЫХ SEO-АГЕНТОМ.
 *
 * Страницы агента и редакционный корпус рендерятся ОДНИМ И ТЕМ ЖЕ шаблоном
 * `/library/[slug]`. Это не экономия файла: у шаблона уже есть разметка
 * Article/FAQPage/BreadcrumbList, блок CTA в услугу, дисклеймер и гейт
 * глубины. Второй шаблон означал бы вторую разметку, которая разойдётся с
 * первой на ближайшей правке — а расходятся такие вещи молча.
 *
 * Поэтому строка базы приводится к `AnonymousLibraryEntry` — типу корпуса.
 * Шаблон не знает и не должен знать, откуда пришла запись.
 */

import {
  approvedLibraryEntries,
  getApprovedLibraryEntry,
  type AnonymousLibraryEntry,
  type LibraryBodySection,
} from "@/data/anonymous-library";
import { mergeBackfill } from "@/lib/seo/backfill";
import { SEO_PAGE_KIND, SEO_PAGE_STATUS } from "@/lib/seo/page-kinds";
import { isLibraryTopic, type LibraryCtaProduct, type LibraryTopic } from "@/lib/library-cta";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";

// Словарь состояний живёт в `page-kinds.ts` — он общий с `backfill.ts`, и
// круговой импорт между ними обошёлся бы дороже одного файла.
export { SEO_PAGE_KIND, SEO_PAGE_STATUS } from "@/lib/seo/page-kinds";

/**
 * Услуга кластера → услуга, в которую конвертирует страница.
 *
 * ⚠ СООТВЕТСТВИЕ ДЕТЕРМИНИРОВАННОЕ, А НЕ ВЫБОР МОДЕЛИ. Фраза пришла из
 * кластера ядра, у кластера есть услуга — значит услуга известна ДО того, как
 * написан хоть один абзац. Дать модели выбирать CTA означало бы получить
 * страницу про измену со ссылкой на «Происхождение фамилии»: модель выберет
 * то, что красивее звучит в тексте, а не то, что закрывает вопрос.
 *
 * У трёх услуг ядра своей карточки в CTA-каталоге нет. Им назначена ближайшая
 * по смыслу, а не «Подробный разбор» всем подряд: гороскоп — это астрология,
 * и человек, пришедший с астрологического запроса, ждёт натальную карту.
 */
const SERVICE_TO_CTA: Record<string, LibraryCtaProduct> = {
  "chat-analysis": "Разбор переписки",
  "pair": "Вместе",
  "reframe": "Переосмысление",
  "deep-report": "Подробный разбор",
  "tarot": "Расклад Таро",
  "natal-chart": "Натальная карта",
  "numerology": "Матрица судьбы",
  "compatibility-by-date": "Совместимость по дате",
  "arcana": "Арканы судьбы",
  "surname-origin": "Происхождение фамилии",
  "horoscope": "Натальная карта",
  "human-design": "Подробный разбор",
  "family-questions": "Вместе",
};

/** Тема каталога по умолчанию для услуги кластера. */
const SERVICE_TO_TOPIC: Record<string, LibraryTopic> = {
  "chat-analysis": "Отношения",
  "pair": "Одиночество",
  "reframe": "Повторяется одно и то же",
  "deep-report": "Выбор и решения",
  "tarot": "Таро",
  "natal-chart": "Натальная карта",
  "numerology": "Матрица судьбы",
  "compatibility-by-date": "Совместимость",
  "arcana": "Таро",
  "surname-origin": "Имя и фамилия",
  "horoscope": "Натальная карта",
  "human-design": "Про себя",
  "family-questions": "Отношения",
};

export function ctaProductForService(service: string | null | undefined): LibraryCtaProduct {
  return SERVICE_TO_CTA[(service ?? "").trim()] ?? "Подробный разбор";
}

export function topicForService(service: string | null | undefined): LibraryTopic {
  return SERVICE_TO_TOPIC[(service ?? "").trim()] ?? "Выбор и решения";
}

function bodyOf(value: unknown): LibraryBodySection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const section = (raw ?? {}) as Record<string, unknown>;
      const heading = typeof section.heading === "string" ? section.heading.trim() : "";
      const paragraphs = Array.isArray(section.paragraphs)
        ? section.paragraphs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      return { heading, paragraphs };
    })
    .filter((section) => section.heading.length > 0 && section.paragraphs.length > 0);
}

function faqsOf(value: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const faq = (raw ?? {}) as Record<string, unknown>;
      return {
        question: typeof faq.question === "string" ? faq.question.trim() : "",
        answer: typeof faq.answer === "string" ? faq.answer.trim() : "",
      };
    })
    .filter((faq) => faq.question.length > 0 && faq.answer.length > 0);
}

/** Минимальная форма строки, из которой собирается запись корпуса. */
export interface SeoLibraryPageRow {
  slug: string;
  topic: string;
  question: string;
  summary: string;
  metaTitle: string;
  metaDescription: string;
  body: unknown;
  perspectives: string[];
  faqs: unknown;
  mainForkTitle: string | null;
  mainForkNote: string | null;
  firstStep: string | null;
  ctaProduct: string;
  publishedAt: Date | null;
  updatedAt: Date;
}

/**
 * Строка базы → запись корпуса.
 *
 * `reactions` у агентской страницы нет и быть не может: это счётчик откликов
 * живых людей на вопрос из диалога. Ставим ноль — шаблон показывает «откликов
 * по теме», и выдуманное число здесь было бы враньём в единственном месте
 * страницы, где стоит цифра.
 */
export function seoPageToLibraryEntry(row: SeoLibraryPageRow): AnonymousLibraryEntry {
  const topic = isLibraryTopic(row.topic) ? row.topic : "Выбор и решения";
  return {
    slug: row.slug,
    topic,
    question: row.question,
    summary: row.summary,
    perspectives: row.perspectives,
    reactions: 0,
    status: "approved",
    // B714: признак вычисляется гейтом глубины, а не читается из данных.
    // Здесь он обязан стоять, потому что так устроен тип корпуса, но решение
    // об индексации принимает `libraryDepth()` по телу записи.
    indexable: true,
    ctaProduct: row.ctaProduct as AnonymousLibraryEntry["ctaProduct"],
    ...(row.mainForkTitle
      ? { mainFork: { title: row.mainForkTitle, note: row.mainForkNote ?? undefined } }
      : {}),
    seo: { metaTitle: row.metaTitle, metaDescription: row.metaDescription },
    // Дата редакционной проверки — дата выпуска страницы. Без неё шаблон взял
    // бы общую дату корпуса (22.07.2026) и страница заявляла бы проверку
    // раньше собственного появления.
    reviewedAt: (row.publishedAt ?? row.updatedAt).toISOString().slice(0, 10),
    faqs: faqsOf(row.faqs),
    body: bodyOf(row.body),
  };
}

const PAGE_SELECT = {
  slug: true,
  topic: true,
  question: true,
  summary: true,
  metaTitle: true,
  metaDescription: true,
  body: true,
  perspectives: true,
  faqs: true,
  mainForkTitle: true,
  mainForkNote: true,
  firstStep: true,
  ctaProduct: true,
  publishedAt: true,
  updatedAt: true,
} as const;

/**
 * Опубликованные страницы агента.
 *
 * ⚠ НИКОГДА НЕ БРОСАЕТ. Эта выборка идёт в рендер публичной страницы и в карту
 * сайта. Отказ базы обязан стоить отсутствия агентских записей, а не пятисотки
 * на всей Библиотеке.
 */
export async function publishedSeoLibraryEntries(): Promise<AnonymousLibraryEntry[]> {
  const rows = await db.seoLibraryPage
    .findMany({
      where: { status: SEO_PAGE_STATUS.published },
      orderBy: { publishedAt: "desc" },
      select: PAGE_SELECT,
    })
    .catch((error: unknown) => {
      log.warn("seo-library.list_failed", { error: serializeError(error) });
      return [] as SeoLibraryPageRow[];
    });
  return rows.map(seoPageToLibraryEntry);
}

export async function getPublishedSeoLibraryEntry(slug: string): Promise<AnonymousLibraryEntry | null> {
  const row = await db.seoLibraryPage
    .findFirst({
      where: { slug, status: SEO_PAGE_STATUS.published },
      select: PAGE_SELECT,
    })
    .catch((error: unknown) => {
      log.warn("seo-library.get_failed", { slug, error: serializeError(error) });
      return null;
    });
  return row ? seoPageToLibraryEntry(row) : null;
}

/**
 * B741 — ДОПИСАННЫЕ ТЕЛА ДЛЯ КАРТОЧЕК РЕДАКЦИОННОГО КОРПУСА.
 *
 * Отдельный запрос, а не часть `publishedSeoLibraryEntries`: там строки —
 * самостоятельные страницы, здесь — надстройка над чужим слагом. Смешать их
 * значило бы получить каталог, в котором одна и та же карточка стоит дважды.
 */
const BACKFILL_SELECT = {
  slug: true,
  body: true,
  faqs: true,
  perspectives: true,
  mainForkTitle: true,
  mainForkNote: true,
  metaTitle: true,
  metaDescription: true,
  publishedAt: true,
} as const;

export type BackfillRow = {
  slug: string;
  body: unknown;
  faqs: unknown;
  perspectives: string[];
  mainForkTitle: string | null;
  mainForkNote: string | null;
  metaTitle: string;
  metaDescription: string;
  publishedAt: Date | null;
};

export async function publishedBackfills(): Promise<Map<string, BackfillRow>> {
  const rows = await db.seoLibraryPage
    .findMany({
      where: { kind: SEO_PAGE_KIND.backfill, status: SEO_PAGE_STATUS.published },
      select: BACKFILL_SELECT,
    })
    .catch((error: unknown) => {
      log.warn("seo-library.backfill_list_failed", { error: serializeError(error) });
      return [] as BackfillRow[];
    });
  return new Map(rows.map((row) => [row.slug, row]));
}

/**
 * Редакционный корпус с наложенными дописываниями.
 *
 * ⚠ ОДИН ЗАПРОС НА ВЫЗОВ, А НЕ ПО ЗАПРОСУ НА КАРТОЧКУ. Двести карточек ×
 * отдельный `findUnique` — это двести запросов на сборку каталога и карты
 * сайта. Заход выглядел бы рабочим ровно до первого дня с живым трафиком.
 */
export async function libraryEntriesWithBackfill(): Promise<AnonymousLibraryEntry[]> {
  const [entries, backfills] = await Promise.all([
    Promise.resolve(approvedLibraryEntries()),
    publishedBackfills(),
  ]);
  return entries.map((entry) => {
    const backfill = backfills.get(entry.slug);
    return backfill ? mergeBackfill(entry, backfill) : entry;
  });
}

/** Одна карточка корпуса с дописыванием, если оно есть. */
export async function getLibraryEntryWithBackfill(slug: string): Promise<AnonymousLibraryEntry | null> {
  const entry = getApprovedLibraryEntry(slug);
  if (!entry) return null;
  const row = await db.seoLibraryPage
    .findFirst({
      where: { slug, kind: SEO_PAGE_KIND.backfill, status: SEO_PAGE_STATUS.published },
      select: BACKFILL_SELECT,
    })
    .catch(() => null);
  return row ? mergeBackfill(entry, row) : entry;
}
