/**
 * B776 F4 — ПРИЗЫВ В ПОСЛЕДНЕЙ ЧАСТИ ЦЕПОЧКИ THREADS СТРОИТ КОД, НЕ МОДЕЛЬ.
 *
 * Модель выбирает только цель из белого списка (`ctaTarget`), а адрес, метки и
 * фразу собирает код: выдуманной ссылке взяться неоткуда. Не больше одного
 * призыва в сутки (слот отмечает `threadsDayLineup`), только у экспертных
 * цепочек; в самом посте ссылки нет никогда. `/library` в списке нет и быть не
 * должно: библиотека — не продающая посадка.
 */

import { splitThreadsChain } from "@/lib/marketing/threads-chain";

const SITE = "https://eterapy.com";
const B = "(?<![а-яё])";

export interface CtaTarget {
  slug: string;
  path: string;
  keywords: RegExp;
  phrase: string;
}

const service = (slug: string, keywords: string, phrase: string): CtaTarget => ({
  slug, path: `/products/${slug}`, keywords: new RegExp(`${B}(?:${keywords})`, "iu"), phrase,
});

export const CTA_TARGETS: readonly CtaTarget[] = [
  service("reframe", "переосмысл|перепрожи|взгляд\\s+со\\s+сторон", "посмотрите на неё свежим взглядом"),
  service("deep-report", "подробн[а-яё]*\\s+разбор|глубок[а-яё]*\\s+разбор", "можно разобрать её подробно"),
  service("chat-analysis", "переписк|сообщени|чат", "можно разобрать вашу переписку"),
  service("pair", "пар(?:а|у|ы|ой|е)(?![а-яё])|партн[её]р|вдвоём|отношени", "можно разобрать её вдвоём"),
  service("tarot", "таро|расклад|карт[аыу]", "можно сделать расклад Таро"),
  service("natal-chart", "натальн|карт[аы]\\s+рождени|асцендент", "можно посмотреть вашу натальную карту"),
  service("compatibility-by-date", "совместимост", "можно проверить совместимость по дате"),
  service("horoscope", "гороскоп|прогноз|знак[а-яё]*\\s+зодиак", "можно посмотреть ваш гороскоп"),
  service("arcana", "аркан|матриц[аыу]\\s+судьб", "можно посмотреть ваши арканы"),
  service("numerology", "нумеролог|число\\s+судьб|дат[аыу]\\s+рождени", "можно посмотреть вашу нумерологию"),
  service("family-questions", "семь[яиюе]|родител|мам(?:а|ы|у)(?![а-яё])|дет(?:и|ей|ям|ях)(?![а-яё])", "можно разобрать семейный вопрос"),
  service("human-design", "дизайн\\s+человека|генератор|проектор", "можно узнать свой дизайн человека"),
  service("surname-origin", "фамили|род[ау]\\s+предк|предк", "можно узнать происхождение фамилии"),
  { slug: "ai-psychologist", path: "/ai-psychologist", keywords: /(?!)/u, phrase: "можно спокойно обсудить её с ИИ-собеседником, бесплатно" },
  { slug: "checkin", path: "/checkin", keywords: /(?!)/u, phrase: "начните с короткого чек-ина" },
];

export const CTA_FALLBACK_SLUG = "checkin";
export const CTA_UTM = { source: "threads", medium: "social", campaign: "expert-chain" } as const;
const CTA_PREFIX = "Если у вас похожая ситуация — ";

/** Форматы экспертных цепочек Threads, которым разрешён призыв (только существующие в библиотеке Threads). */
export const CTA_ELIGIBLE_LABELS: ReadonlySet<string> = new Set([
  "Если бы ко мне пришёл запрос",
  "серия «День N/30»",
  "серия «Паттерн дня N/30»",
  "миф и правда: разбор",
  "мини-практика: пример и шаги",
  "чек-лист цепочкой",
]);

export function isCtaEligibleLabel(label: string | null | undefined): boolean {
  return Boolean(label && CTA_ELIGIBLE_LABELS.has(label));
}

function targetBySlug(raw: string | undefined): CtaTarget | null {
  const key = raw?.trim().toLowerCase();
  return key ? CTA_TARGETS.find((target) => target.slug === key) ?? null : null;
}

/** Цель автора -> подбор по тексту -> чек-ин. Сюда не попадает ничего вне белого списка. */
export function resolveCtaTarget(raw: string | undefined, postText: string): CtaTarget {
  return targetBySlug(raw)
    ?? CTA_TARGETS.find((target) => target.keywords.test(postText))
    ?? targetBySlug(CTA_FALLBACK_SLUG)!;
}

/** B777: место призыва в цепочке — для замера A/B по `utm_content=<услуга>-mid|end`. */
export type CtaPlace = "mid" | "end";

export function buildCtaUrl(target: CtaTarget, place?: CtaPlace): string {
  const query = new URLSearchParams({
    utm_source: CTA_UTM.source,
    utm_medium: CTA_UTM.medium,
    utm_campaign: CTA_UTM.campaign,
    utm_content: place ? `${target.slug}-${place}` : target.slug,
  });
  return `${SITE}${target.path}?${query.toString()}`;
}

export function buildCtaLine(target: CtaTarget, place?: CtaPlace): string {
  return `${CTA_PREFIX}${target.phrase}: ${buildCtaUrl(target, place)}`;
}

const TLDS = "com|ru|org|net|io|me|app|ai|su|рф|info|co|tv|ly|xyz|site|online|pro";
/** Схема, www. или голый домен (eterapy.com/…, t.me/…): модели ссылки не пишут, их строит код. */
const URL_RE = new RegExp(
  `(?:https?:\\/\\/|www\\.)\\S+|(?<![\\p{L}\\p{N}@.\\-])[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?:\\/\\S*)?(?![\\p{L}\\p{N}])`,
  "giu",
);

/** Убирает любые адреса из текста; строка, остававшаяся пустой, исчезает. */
export function stripModelUrls(text: string): string {
  return text
    .replace(URL_RE, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Продолжение + одна строка призыва последней; любые ссылки и свои призывы модели снимаются. */
export function appendCtaPart(replyText: string, input: { ctaTarget?: string; postText: string }): string {
  const withoutModelCta = replyText.split("\n").filter((line) => !line.includes(CTA_PREFIX)).join("\n");
  const body = stripModelUrls(withoutModelCta);
  const target = resolveCtaTarget(input.ctaTarget, `${input.postText}\n${body}`);
  return body ? `${body}\n\n${buildCtaLine(target)}` : buildCtaLine(target);
}

/**
 * B777: призыв — ОТДЕЛЬНАЯ короткая часть цепочки, а не хвост последней. Модель
 * пишет только пользу; код снимает из неё любые адреса и свои призывы, а строку
 * призыва хранит отдельно и вставляет при выпуске (`chainWithCta`).
 */
export function ctaPartFor(
  replyText: string,
  input: { ctaTarget?: string; postText: string; place: CtaPlace },
): { replyText: string; ctaLine: string } {
  const body = stripModelUrls(replyText.split("\n").filter((line) => !line.includes(CTA_PREFIX)).join("\n"));
  const target = resolveCtaTarget(input.ctaTarget, `${input.postText}\n${body}`);
  return { replyText: body, ctaLine: buildCtaLine(target, input.place) };
}

/**
 * Части продолжения в порядке выхода. `end` — призыв последней частью; `mid` —
 * перед закрывающей частью (последняя часть — короткая строка после ссылки).
 * Если часть одна, призыв идёт после неё в обоих вариантах.
 */
export function chainWithCta(replyText: string, ctaLine?: string | null, place: CtaPlace = "end"): string[] {
  const parts = splitThreadsChain(replyText);
  if (!ctaLine?.trim()) return parts;
  if (place === "end" || parts.length < 2) return [...parts, ctaLine.trim()];
  return [...parts.slice(0, -1), ctaLine.trim(), parts[parts.length - 1]];
}

/** Инструкция автору: только список целей, строку строит код. */
export function ctaWriterInstructions(): { ctaTargets: string[]; rule: string } {
  return {
    ctaTargets: CTA_TARGETS.map((target) => target.slug),
    rule: "В этом материале есть призыв: верни в поле ctaTarget ОДИН слаг из ctaTargets, ближайший к теме (если ничего не подходит — checkin). Адрес, UTM и фразу призыва строит код отдельной короткой частью после пользы: в text и replyText ссылок и призывов не пиши, польза должна быть выдана целиком до призыва.",
  };
}
