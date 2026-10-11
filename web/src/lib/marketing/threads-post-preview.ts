/**
 * Текст чужого поста Threads по ссылке — из публичных метаданных страницы
 * (`og:description`), тех же, что читает любое превью ссылки в мессенджере.
 * Вход в аккаунт не используется, закрытое не читается: если страница не
 * отдала текст, возвращается `null`, и владельца просят вставить текст сам.
 *
 * Ссылка проверяется строго (хост и вид пути): адрес берётся из сообщения
 * владельца, и ходить по произвольным URL эта функция не должна.
 */

import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";

const SHARE_PATH = /^\/share\/[\w-]+\/?$/;
const POST_PATH = /^\/@[\w.]+\/post\/[\w-]+\/?$/;
const PREVIEW_UA = "Mozilla/5.0 (compatible; facebookexternalhit/1.1)";

export interface ThreadsPostPreview {
  author: string | null;
  text: string;
}

/** Нормализует ссылку к пути на threads.com/threads.net; всё остальное отбрасывается. */
export function threadsPreviewPath(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^(www\.)?threads\.(com|net)$/i.test(url.hostname)) return null;
  return SHARE_PATH.test(url.pathname) || POST_PATH.test(url.pathname) ? url.pathname : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function metaContent(html: string, property: string): string | null {
  const tag = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, "i").exec(html);
  return tag ? decodeHtmlEntities(tag[1]).trim() : null;
}

/** Чистый разбор страницы. */
export function parseThreadsPreview(html: string): ThreadsPostPreview | null {
  const text = metaContent(html, "og:description");
  if (!text || text.length < 3) return null;
  const title = metaContent(html, "og:title");
  const author = title ? /\(@([\w.]+)\)/.exec(title)?.[1] ?? null : null;
  return { author: author ? `@${author}` : null, text };
}

export async function fetchThreadsPostPreview(rawUrl: string): Promise<ThreadsPostPreview | null> {
  const path = threadsPreviewPath(rawUrl);
  if (!path) return null;
  try {
    const response = await fetch(`${metaEndpoint("threads-web")}${path}`, {
      headers: metaRequestHeaders({ "user-agent": PREVIEW_UA, accept: "text/html" }),
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return parseThreadsPreview((await response.text()).slice(0, 2_000_000));
  } catch {
    return null;
  }
}
