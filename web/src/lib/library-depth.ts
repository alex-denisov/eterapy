import { librarySection, type AnonymousLibraryEntry } from "@/data/anonymous-library";

/**
 * B714 · Гейт глубины библиотеки.
 *
 * ЗАЧЕМ ЭТОТ ФАЙЛ ВООБЩЕ СУЩЕСТВУЕТ. 2026-08-17 Яндекс вынес «Библиотеку
 * вопросов» из индекса целиком: 219 страниц → 43. Технических причин не было
 * (200, canonical, JSON-LD, sitemap — всё проверено на проде). Причина в
 * данных: у 138 карточек из 138 в модели НЕ БЫЛО поля под развёрнутый ответ.
 * Уникального текста на странице — `question`, `summary`, `mainFork.title` и
 * `freeFragment`, то есть ≈50–60 слов; остальные ~430 слов из 491 — общая
 * обвязка, повторённая 199 раз. Вердикт «малоценная страница» описывал это
 * буквально.
 *
 * ⚠ ГЛАВНОЕ РЕШЕНИЕ ЗДЕСЬ: ПРИЗНАК `indexable` БОЛЬШЕ НЕ ПРОСТАВЛЯЕТСЯ РУКАМИ.
 * В данных он стоял `true` у всех 199 записей — потому что его ставил автор
 * карточки, а не свойство карточки. Признак, который можно проставить,
 * рано или поздно проставят: именно так тонкий корпус и попал в карту сайта
 * целиком. Теперь глубина ВЫЧИСЛЯЕТСЯ из самой записи, и соврать ей нельзя.
 *
 * ⚠ ЧТО ЭТО НЕ ДЕЛАЕТ. Гейт не удаляет карточку и не прячет её от людей.
 * Тонкая запись остаётся в каталоге, открывается по своему адресу и участвует
 * в перелинковке — она просто не предлагается поисковику как самостоятельный
 * материал. Разделение намеренное: у «показать человеку» и «предложить в
 * индекс» разные требования, и раньше их держало одно поле.
 */

/**
 * Слов собственного текста, ниже которых страница не материал, а карточка.
 *
 * ⚠ ЧИСЛО ВЗЯТО ИЗ ЗАМЕРА КОРПУСА, А НЕ ИЗ ОКРУГЛЕНИЯ. Прогон гейта по всем
 * 200 записям 2026-08-23 показал две плотные группы и пустоту между ними:
 *
 *   карточки-заглушки      169…241 собственных слов (173 записи)
 *   ——— ни одной записи в промежутке 242…553 ———
 *   корпус услуг и арканов 552…592 собственных слов (27 записей)
 *
 * Рубеж стоит посередине пустоты. Он отделяет карточку от материала и при
 * этом не проходит по краю ни одной живой группы: чтобы его пересечь, запись
 * должна вырасти вдвое, а не на десяток слов.
 *
 * Ставить 600, как предполагал разбор тикета, оказалось нельзя: корпус
 * арканов даёт 552…581 слово и вылетел бы целиком — а это единственный наш
 * материал, который УЖЕ берёт позиции 5–12 в Яндексе. Гейт, снимающий с
 * индекса лучшее, что есть, чинит не ту проблему.
 *
 * 600–900 слов остаются РЕДАКЦИОННОЙ нормой для вновь пишущихся материалов:
 * норма говорит, каким писать, а рубеж — что не пускать. Это разные числа.
 */
export const LIBRARY_MIN_OWN_WORDS = 450;

/** Своих вопросов FAQ. Один — это подпись, а не раздел. */
export const LIBRARY_MIN_OWN_FAQS = 2;

/** Своих пунктов «что можно проверить». */
export const LIBRARY_MIN_OWN_CHECKS = 2;

export function countWords(value: string): number {
  return value.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * Сколько на странице СОБСТВЕННЫХ слов.
 *
 * Считается только то, чего нет у соседней карточки той же темы: тело
 * материала, свой FAQ, свои проверки, своя развилка. Общий дисклеймер,
 * шапка и подвал сюда не входят намеренно — именно их 430 слов создавали
 * иллюзию наполненной страницы, пока уникальных было 60.
 */
export function libraryOwnWordCount(entry: AnonymousLibraryEntry): number {
  const parts: string[] = [entry.question, entry.summary];
  for (const section of entry.body ?? []) {
    parts.push(section.heading, ...section.paragraphs);
  }
  for (const faq of entry.faqs ?? []) parts.push(faq.question, faq.answer);
  parts.push(...entry.perspectives);
  if (entry.mainFork?.title) parts.push(entry.mainFork.title);
  if (entry.mainFork?.note) parts.push(entry.mainFork.note);
  if (entry.freeFragment) parts.push(entry.freeFragment);
  parts.push(...attachedCorpusText(entry.slug));
  return countWords(parts.join(" "));
}

/**
 * ⚠ У ЧАСТИ ЗАПИСЕЙ ТЕЛО ЛЕЖИТ НЕ В ЗАПИСИ.
 *
 * Пять записей услуг (B648) и 22 записи арканов (B710) не хранят текст в
 * `body`: их корпус живёт в `lib/service-guides.ts` и `lib/arcana/`, а страница
 * читает его напрямую и печатает целиком. Это сделано намеренно — второе
 * место, где написан тот же абзац, разойдётся с первым.
 *
 * Считать эти страницы тонкими было бы прямой ошибкой измерения: корпус
 * арканов — единственный, который уже берёт позиции 5–12 в Яндексе. Гейт
 * обязан мерить то, что страница ПЕЧАТАЕТ, а не то, где лежит источник.
 */
function attachedCorpusText(slug: string): string[] {
  const parts: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const guides = require("@/lib/service-guides") as typeof import("@/lib/service-guides");
  const attached = guides.serviceGuideBySlug(slug);
  if (attached) {
    const g = attached.guide;
    parts.push(g.heading, g.answer, g.interpretationTitle, g.boundary);
    parts.push(...g.usefulFor, ...g.interpretation, ...g.examples);
    for (const step of g.process) parts.push(step.title, step.text);
    for (const faq of g.faqs) parts.push(faq.question, faq.answer);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const arcana = require("@/lib/arcana") as typeof import("@/lib/arcana");
  const card = arcana.arcanaGuideBySlug(slug);
  if (card) {
    parts.push(card.heading, card.answer, card.year, card.compatibility, card.boundary);
    parts.push(...card.essence, ...card.strengths, ...card.distortions);
    if (card.confusion) parts.push(card.confusion);
    for (const position of card.positions) parts.push(position.title, position.text);
  }
  return parts;
}

export interface LibraryDepthVerdict {
  indexable: boolean;
  ownWords: number;
  /** Чего именно не хватает. Пусто — запись проходит. */
  missing: string[];
}

/**
 * Проходит ли запись в индекс.
 *
 * Требования перечислены отдельно, а не свёрнуты в один булев ответ: когда
 * запись не проходит, автору нужно знать ЧТО дописать, иначе гейт превращается
 * в молчаливый отказ — тот самый вид отказа, из-за которого корпус и умер
 * незаметно.
 */
export function libraryDepth(entry: AnonymousLibraryEntry): LibraryDepthVerdict {
  const missing: string[] = [];
  const ownWords = libraryOwnWordCount(entry);

  /**
   * Тело обязательно, но «тело» — это текст на странице, а не поле `body`:
   * записи услуг и арканов носят его в присоединённом корпусе.
   */
  if (!entry.body?.length && attachedCorpusText(entry.slug).length === 0) {
    missing.push("нет тела материала (`body`)");
  }
  if (ownWords < LIBRARY_MIN_OWN_WORDS) {
    missing.push(`собственных слов ${ownWords}, нужно ${LIBRARY_MIN_OWN_WORDS}`);
  }
  /**
   * ⚠ ТРЕБОВАНИЯ К ПОЛЯМ СПРАШИВАЮТСЯ НЕ У ВСЕХ, И ЭТО НЕ ПОБЛАЖКА.
   *
   * `faqs`, `perspectives` и `mainFork.note` требуются потому, что БЕЗ НИХ
   * шаблон печатает на всех страницах темы один и тот же абзац: у 138 записей
   * из 138 стояла общая заметка, у 135 — общий FAQ, у 76 — общий список
   * проверок. То есть требование не к наличию полей, а к РАЗЛИЧИМОСТИ страниц.
   *
   * У записи с присоединённым корпусом (услуга, аркан) различимость обеспечена
   * самим корпусом: он свой на каждой странице и печатается целиком. Спрашивать
   * с неё те же поля значило бы требовать различимость дважды и снять с
   * индекса единственный материал, который уже берёт позиции в Яндексе.
   */
  const hasOwnCorpus = attachedCorpusText(entry.slug).length > 0;
  if (!hasOwnCorpus) {
    if ((entry.faqs?.length ?? 0) < LIBRARY_MIN_OWN_FAQS) {
      missing.push(`своих вопросов FAQ ${entry.faqs?.length ?? 0}, нужно ${LIBRARY_MIN_OWN_FAQS}`);
    }
    if (entry.perspectives.length < LIBRARY_MIN_OWN_CHECKS) {
      missing.push(`своих проверок ${entry.perspectives.length}, нужно ${LIBRARY_MIN_OWN_CHECKS}`);
    }
    if (!entry.mainFork?.note?.trim()) {
      missing.push("нет своей заметки к развилке (`mainFork.note`)");
    }
  }

  return { indexable: entry.status === "approved" && missing.length === 0, ownWords, missing };
}

export function libraryIsIndexable(entry: AnonymousLibraryEntry): boolean {
  return libraryDepth(entry).indexable;
}

/**
 * B714 — самоповтор: какие предложения на странице УЖЕ напечатаны.
 *
 * Живая проверка `/library/net-nastoyashchikh-druzey` до правки: фраза
 * «Близость строится через повторный контакт…» встречалась ТРИЖДЫ — в списке
 * «что можно проверить», в блоке «первый шаг» и в ответе FAQ. Виноват был не
 * набор данных, а шаблон: `libraryFaqs()` строил ответы из `summary` и
 * `firstStep`, то есть из того, что страница уже показала выше.
 */
export function normalizeSentence(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function isEchoOf(candidate: string, already: readonly string[]): boolean {
  const normalized = normalizeSentence(candidate);
  if (!normalized) return true;
  return already.some((printed) => {
    const other = normalizeSentence(printed);
    if (!other) return false;
    return normalized === other || normalized.includes(other) || other.includes(normalized);
  });
}

export { librarySection };
