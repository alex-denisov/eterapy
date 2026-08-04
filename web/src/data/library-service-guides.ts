/**
 * B648 · Записи библиотеки, несущие корпус услуг.
 *
 * Владелец: библиотека «должна стать посадочной страницей для кучи разного
 * SEO». Эти пять записей — не пересказ карточек-вопросов, а разбор самого
 * формата: что даёт, кому полезен, как проходит, что разбирается, границы и FAQ.
 *
 * ⚠ ПОЧЕМУ ЗАПИСИ ОТДЕЛЬНЫМ ФАЙЛОМ. Корпус живёт в `lib/service-guides.ts` и
 * читается страницей записи напрямую. Здесь — только «шапка» записи: вопрос,
 * которым её ищут, тема и мета. Дублировать текст корпуса в поля записи нельзя:
 * второе место, где написан тот же абзац, разойдётся с первым.
 *
 * ⚠ Вопрос записи сформулирован как ПОИСКОВЫЙ запрос, а не как заголовок
 * услуги. Замер B470/B550: по головным названиям услуг сайта в выдаче нет, а
 * трафик, который вообще доходит, приходит на длинные формулировки.
 */

import type { AnonymousLibraryEntry } from "@/data/anonymous-library";
import { SERVICE_GUIDES, SERVICE_GUIDE_LIBRARY_SLUG } from "@/lib/service-guides";
import type { V5ProductSlug } from "@/lib/v5-products";

type GuideEntryMeta = {
  service: V5ProductSlug;
  topic: AnonymousLibraryEntry["topic"];
  question: string;
  metaTitle: string;
  metaDescription: string;
  /** Тёплый счётчик отклика — тот же порядок, что у остальных записей корпуса. */
  reactions: number;
};

const META: readonly GuideEntryMeta[] = [
  {
    service: "chat-analysis",
    topic: "Отношения",
    question: "Я перечитываю переписку по кругу и не понимаю, где факты, а где я себя накручиваю",
    metaTitle: "Как разобрать переписку: тон, инициатива и что ответить",
    metaDescription: "Что видно в переписке на самом деле, а что мы додумываем: тон, инициатива, уход от вопроса и спокойные варианты ответа.",
    reactions: 58,
  },
  {
    service: "tarot",
    topic: "Выбор и решения",
    question: "Я делаю расклад Таро онлайн, но боюсь читать его как приговор — как понять, что он мне даёт?",
    metaTitle: "Как читать расклад Таро онлайн: позиции, вопрос и границы",
    metaDescription: "Как сформулировать вопрос к картам, что означают позиции расклада и почему повторный расклад усиливает сомнения.",
    reactions: 74,
  },
  {
    service: "natal-chart",
    topic: "Про себя",
    question: "Я не знаю, чему верить в натальной карте по дате рождения: где описание меня, а где предсказание?",
    metaTitle: "Что показывает натальная карта: разбор без предсказаний",
    metaDescription: "Что в натальной карте читается как описание склонностей, а что нельзя считать прогнозом событий или характера.",
    reactions: 63,
  },
  {
    service: "compatibility-by-date",
    topic: "Отношения",
    question: "Мы с партнёром разные, и я не понимаю, что совместимость по дате рождения вообще может об этом сказать",
    metaTitle: "Совместимость по дате рождения: что читается, а что нет",
    metaDescription: "Что символическое сравнение двух карт показывает о ритме и различиях пары и почему оно не выносит приговор отношениям.",
    reactions: 51,
  },
  {
    service: "numerology",
    topic: "Про себя",
    question: "Я не могу разобраться, как читать матрицу судьбы по дате рождения и что делать с «негативной программой»",
    metaTitle: "Как читать матрицу судьбы по дате рождения",
    metaDescription: "Из чего складывается матрица судьбы, как читать арканы и почему «негативная программа» — это не приговор.",
    reactions: 96,
  },
];

/**
 * Записи собираются из корпуса, а не пишутся рядом с ним. Услуга без корпуса
 * записи не получает — пустая посадочная страница хуже её отсутствия.
 */
export const serviceGuideLibraryEntries: AnonymousLibraryEntry[] = META.flatMap((meta) => {
  const guide = SERVICE_GUIDES[meta.service];
  const slug = SERVICE_GUIDE_LIBRARY_SLUG[meta.service];
  if (!guide || !slug) return [];

  return [{
    slug,
    topic: meta.topic,
    question: meta.question,
    summary: guide.answer,
    // `perspectives` — резервный формат легаси-карточек. Здесь он несёт три
    // проверяемых пункта, чтобы запись оставалась осмысленной даже там, где
    // блок корпуса ещё не отрисован.
    perspectives: guide.usefulFor.slice(0, 3),
    reactions: meta.reactions,
    status: "approved" as const,
    indexable: true,
    section: "symbolic" as const,
    mainFork: { title: guide.heading, note: guide.boundary },
    faqs: guide.faqs,
    seo: { metaTitle: meta.metaTitle, metaDescription: meta.metaDescription },
  }];
});
