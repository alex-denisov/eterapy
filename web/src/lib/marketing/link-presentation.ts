/**
 * B719 · Как ссылка выглядит в опубликованном материале.
 *
 * Жалоба владельца 2026-08-23: «Сырой UTM-хвост — доработай, сделай эффективно,
 * при этом учти что полную ссылку в постах вообще не нужно публиковать, ее
 * можно скрывать под URL».
 *
 * Что стояло в лентах на самом деле (реестр прода, живые строки):
 *
 *   https://eterapy.com/library/9-arkan-otshelnik-v-matritse-sudby
 *     ?utm_source=telegram&utm_medium=social&utm_campaign=library
 *     &utm_content=9-arkan-otshelnik-v-matritse-sudby
 *
 * 165 символов, из них 108 — метки. В Telegram при пределе поста 900 символов
 * это 18 % материала, потраченных на служебную строку, которую человек не
 * читает. И это не только некрасиво: длину меряет тот же лимит площадки, из-за
 * которого материалы гибли на «превышении» (B713).
 *
 * Лечится двумя независимыми приёмами, и оба нужны.
 */

export type InlineLinkMarkup = "html" | "markdown" | null;

/**
 * ПРИЁМ 1 — УБРАТЬ ИЗ МЕТОК ТО, ЧТО И ТАК ИЗВЕСТНО ИЗ АДРЕСА.
 *
 * `utm_content` у нас всегда равен слагу статьи, а слаг стоит в пути тем же
 * текстом. Метка не добавляет к отчёту ничего: страница входа в Метрике и так
 * называет адрес. Это чистое дублирование длиной в половину хвоста.
 *
 * ⚠ ОСТАЛЬНЫЕ ТРИ МЕТКИ НЕ ТРОГАЕМ, И ЭТО НЕ РОБОСТЬ. `utm_source`,
 * `utm_medium` и `utm_campaign` — те самые три измерения, по которым Метрика
 * строит отчёт по источникам. Сжать их в один короткий параметр (`?s=tg`)
 * заманчиво и на 40 символов короче — но Метрика читает именно `utm_*` из
 * адреса, и своя короткая метка означала бы, что платный и социальный трафик
 * перестанут различаться в отчётах вовсе. Мы уже теряем 7 посетителей из 8 на
 * гейте согласия; терять ещё и разметку источника нельзя.
 */
export function compactMarketingUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const content = url.searchParams.get("utm_content");
  if (content) {
    const lastSegment = url.pathname.replace(/\/+$/u, "").split("/").pop() ?? "";
    if (content === lastSegment) url.searchParams.delete("utm_content");
  }
  // `URL` печатает пустой `?`, если параметров не осталось вовсе.
  const query = url.searchParams.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeHtmlText(value: string): string {
  return value.replace(/[&<>]/gu, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * ПРИЁМ 2 — СПРЯТАТЬ АДРЕС ПОД ТЕКСТ ТАМ, ГДЕ ПЛОЩАДКА ЭТО УМЕЕТ.
 *
 * Telegram и Дзен принимают HTML, Reddit — Markdown. Читатель видит
 * «Разбор целиком», а не строку из 130 символов.
 *
 * ⚠ ЭТО НЕ КОСМЕТИКА: В TELEGRAM ЭТО ЕЩЁ И ДЛИНА. Предел подписи считается по
 * ВИДИМОМУ тексту — разметка сущностей в него не входит. Спрятанный адрес
 * освобождает те самые ~150 символов, из-за нехватки которых материалы
 * возвращались на переписывание.
 *
 * ⚠ ГДЕ НЕЛЬЗЯ — ТАМ НЕ ДЕЛАЕМ, А НЕ ДЕЛАЕМ ВИД. ВКонтакте не отдаёт
 * гиперссылку в теле поста, Instagram вообще не делает ссылки кликабельными
 * (`linksClickable: false`). Подсунуть им markdown значило бы напечатать
 * читателю скобки со звёздочками вместо ссылки — хуже, чем честный адрес.
 */
export function renderMarketingLink(input: {
  markup: InlineLinkMarkup;
  url: string;
  label: string;
}): string {
  const url = compactMarketingUrl(input.url);
  const label = input.label.trim();
  if (!label) return url;
  if (input.markup === "html") {
    return `<a href="${escapeHtmlText(url)}">${escapeHtmlText(label)}</a>`;
  }
  if (input.markup === "markdown") {
    // Скобки в подписи сломали бы разметку — на этот случай отдаём адрес как
    // есть: испорченная разметка хуже длинного адреса.
    if (/[[\]()]/u.test(label)) return url;
    return `[${label}](${url})`;
  }
  return url;
}

/**
 * B719 — укоротить наш собственный адрес прямо в тексте материала.
 *
 * Нужно там, где разметки у площадки нет вовсе (ВКонтакте, Threads, Instagram):
 * спрятать адрес там нельзя, но печатать вдвое более длинный, чем нужно, —
 * тоже незачем. Работает и на строках, заведённых до этой правки: они хранят
 * полный адрес, и переписывать реестр ради косметики не потребуется.
 *
 * ⚠ ТРОГАЕМ ТОЛЬКО СВОЙ АДРЕС. Подмена произвольных ссылок в тексте означала
 * бы правку чужих адресов, которых мы не знаем.
 */
export function compactOwnLinkInBody(body: string, url: string | null): string {
  if (!url) return body;
  const compact = compactMarketingUrl(url);
  if (compact === url || !body.includes(url)) return body;
  return body.split(url).join(compact);
}

/**
 * Перевести готовый ПЛОСКИЙ текст материала в разметку площадки.
 *
 * Порядок именно такой: сначала экранируется ВЕСЬ текст, потом на место
 * адреса ставится ссылка. Обратный порядок означал бы, что мы экранируем
 * собственную разметку и печатаем читателю `&lt;a href=…`.
 *
 * Возвращает `null`, когда переводить нечего: у площадки нет разметки или
 * адреса в тексте не оказалось. `null` читается как «отправляй как есть» и
 * не даёт вызывающему принять экранированный текст за готовый.
 */
export function toPlatformMarkup(input: {
  markup: InlineLinkMarkup;
  body: string;
  url: string | null;
  label: string;
}): { text: string; parseMode: "HTML" | "Markdown" } | null {
  if (!input.markup || !input.url) return null;
  const compact = compactMarketingUrl(input.url);
  const present = [input.url, compact].find((candidate) => input.body.includes(candidate));
  if (!present) return null;

  if (input.markup === "html") {
    const escaped = escapeHtmlText(input.body);
    const anchor = renderMarketingLink({ markup: "html", url: compact, label: input.label });
    const text = escaped.replace(escapeHtmlText(present), anchor);
    return text === escaped ? null : { text, parseMode: "HTML" };
  }

  const link = renderMarketingLink({ markup: "markdown", url: compact, label: input.label });
  if (link === compact) return null;
  const text = input.body.replace(present, link);
  return text === input.body ? null : { text, parseMode: "Markdown" };
}

/**
 * Подпись под ссылкой.
 *
 * Берётся из уже написанного автором призыва, если он есть: это его слова, и
 * подменять их своими значило бы переписывать материал за автора. Призыв
 * приходит вида «Разбор целиком: <адрес>» — под подпись идёт то, что стоит
 * до двоеточия.
 */
export const DEFAULT_LINK_LABEL = "Разбор целиком";

export function linkLabelFromBody(body: string, url: string): string {
  const compact = compactMarketingUrl(url);
  for (const candidate of [url, compact]) {
    const index = body.indexOf(candidate);
    if (index < 0) continue;
    const before = body.slice(0, index).trimEnd();
    const lastLine = before.split("\n").pop()?.trim() ?? "";
    const label = lastLine.replace(/[:\s]+$/u, "").trim();
    if (label && label.length <= 60) return label;
  }
  return DEFAULT_LINK_LABEL;
}
