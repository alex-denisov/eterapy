/**
 * B620 — Дзен через размеченную RSS-ленту.
 *
 * Публичного API публикации у Дзена нет, но документированный путь есть: канал
 * подключает размеченную ленту, и материалы попадают в Дзен как публикации
 * платформы. Это законный путь вместо сохранённой браузерной сессии.
 *
 * Требования площадки, которые здесь исполняются:
 *  • отдельная лента, а не общий фид сайта;
 *  • полный текст в `content:encoded`, короткий анонс в `description`;
 *  • обложка отдельным `enclosure`;
 *  • `pubDate` в формате RFC-822;
 *  • минимум 10 материалов в ленте при первом подключении (см. readiness).
 *
 * Текст в ленте — НЕ копия статьи с сайта: материал для Дзена пишет тот же
 * конвейер writer → независимый редактор, что и остальные площадки. Прямой
 * перенос статьи площадка почти не показывает, а дубль ещё и вредит SEO-эпику
 * B470.
 */

import db from "@/lib/db";
import { marketingPlatformValue } from "@/lib/marketing/platform-settings";

/** Порог площадки при первом подключении ленты. */
export const DZEN_FEED_MINIMUM_ITEMS = 10;
/** Сколько материалов держим в ленте. Дзен читает ленту целиком. */
export const DZEN_FEED_WINDOW = 20;
/** Префикс идентификатора выпуска через ленту — отличает его от браузерного. */
export const DZEN_FEED_POST_PREFIX = "dzen-feed:";

export interface DzenFeedItem {
  key: string;
  title: string;
  body: string;
  link: string | null;
  mediaUrl: string | null;
  publishedAt: Date | null;
  cluster: string | null;
}

export function dzenFeedGuid(key: string) {
  return `${DZEN_FEED_POST_PREFIX}${key}`;
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cdata(value: string) {
  // Единственная последовательность, которая может закрыть секцию раньше срока.
  return `<![CDATA[${value.replaceAll("]]>", "]]&gt;")}]]>`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** RFC-822. Intl тут не подходит: площадке нужен именно этот формат. */
export function rfc822(value: Date): string {
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${WEEKDAYS[value.getUTCDay()]}, ${pad(value.getUTCDate())} ${MONTHS[value.getUTCMonth()]} `
    + `${value.getUTCFullYear()} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:`
    + `${pad(value.getUTCSeconds())} +0000`;
}

/**
 * Абзацы материала превращаются в HTML: `content:encoded` Дзен разбирает как
 * разметку, и без абзацев статья приезжает одной простыней.
 */
/**
 * B642: писатель размечает выделения по-markdown’ному — `**так**`. В ленте это
 * HTML, и звёздочки уезжали в Дзен буквально: «**Три вопроса:**» вместо жирной
 * строки. Замечено на первых же двух материалах, попавших в ленту 03.08.
 *
 * Преобразование делается ПОСЛЕ экранирования, поэтому в разметку попадают
 * только наши собственные теги: текст пользователя к этому моменту уже не
 * содержит ни `<`, ни `&`.
 */
function inlineMarkup(escaped: string): string {
  return escaped.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
}

export function dzenBodyHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${inlineMarkup(xml(block)).replaceAll("\n", "<br />")}</p>`)
    .join("\n");
}

export function dzenAnnounce(body: string, limit = 220): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function buildDzenFeed(input: {
  items: DzenFeedItem[];
  channelUrl: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const items = input.items.map((item) => {
    const html = dzenBodyHtml(item.body);
    return [
      "    <item>",
      `      <title>${xml(item.title)}</title>`,
      `      <link>${xml(item.link ?? input.channelUrl)}</link>`,
      `      <guid isPermaLink="false">${xml(dzenFeedGuid(item.key))}</guid>`,
      `      <pubDate>${rfc822(item.publishedAt ?? now)}</pubDate>`,
      "      <author>ETerapy</author>",
      item.cluster ? `      <category>${xml(item.cluster)}</category>` : null,
      `      <description>${xml(dzenAnnounce(item.body))}</description>`,
      item.mediaUrl
        ? `      <enclosure url="${xml(item.mediaUrl)}" type="image/png" />`
        : null,
      `      <content:encoded>${cdata(html)}</content:encoded>`,
      "    </item>",
    ].filter(Boolean).join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"'
    + ' xmlns:media="http://search.yahoo.com/mrss/"'
    + ' xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>ETerapy — разбор ситуаций без предсказаний</title>",
    `    <link>${xml(input.channelUrl)}</link>`,
    "    <description>Материалы ETerapy для Дзена: как отделить факты от догадок и увидеть следующий шаг.</description>",
    "    <language>ru</language>",
    `    <lastBuildDate>${rfc822(now)}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** Материалы, уже переданные в ленту. Браузерные публикации сюда не попадают. */
export async function dzenFeedItems(limit = DZEN_FEED_WINDOW): Promise<DzenFeedItem[]> {
  const rows = await db.externalPublication.findMany({
    where: {
      platform: { in: ["dzen", "Dzen", "DZEN"] },
      contentType: "POST",
      status: "PUBLISHED",
      externalPostId: { startsWith: DZEN_FEED_POST_PREFIX },
      body: { not: null },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      key: true,
      title: true,
      body: true,
      destinationUrl: true,
      mediaUrl: true,
      publishedAt: true,
      cluster: true,
    },
  });
  return rows.map((row) => ({
    key: row.key,
    title: row.title,
    body: row.body ?? "",
    link: row.destinationUrl,
    mediaUrl: row.mediaUrl,
    publishedAt: row.publishedAt,
    cluster: row.cluster,
  }));
}

export async function dzenFeedConfirmed(): Promise<boolean> {
  const value = await marketingPlatformValue("DZEN_FEED_CONFIRMED").catch(() => null);
  return value?.trim().toLowerCase() === "true" || value?.trim() === "1";
}

export interface DzenFeedReadiness {
  /** Материалов в ленте сейчас. */
  items: number;
  /** Одобренных материалов для Дзена, ожидающих своего слота. */
  pending: number;
  /** Хватает ли материалов, чтобы площадка приняла ленту. */
  enough: boolean;
  /** Признал ли владелец ленту подключённой (тогда браузерный путь не нужен). */
  confirmed: boolean;
  feedUrl: string;
}

export async function dzenFeedReadiness(origin = "https://eterapy.com"): Promise<DzenFeedReadiness> {
  const [items, pending, confirmed] = await Promise.all([
    db.externalPublication.count({
      where: {
        platform: { in: ["dzen", "Dzen", "DZEN"] },
        status: "PUBLISHED",
        externalPostId: { startsWith: DZEN_FEED_POST_PREFIX },
      },
    }),
    db.externalPublication.count({
      where: {
        platform: { in: ["dzen", "Dzen", "DZEN"] },
        status: { in: ["DRAFT", "REVIEW", "SCHEDULED"] },
      },
    }),
    dzenFeedConfirmed(),
  ]);
  return {
    items,
    pending,
    enough: items >= DZEN_FEED_MINIMUM_ITEMS,
    confirmed,
    feedUrl: new URL("/api/marketing/dzen/rss", origin).toString(),
  };
}
