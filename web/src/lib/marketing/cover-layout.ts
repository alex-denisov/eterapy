/**
 * B727 — одно правило выбора раскладки обложки на два места вызова.
 *
 * До этого решение «диалоговый мокап или графика» принимали ДВА независимых
 * куска кода — `agent.ts` при утверждении материала и маршрут
 * `api/marketing/media/[key]` при отрисовке, — и оба спрашивали ЗАГОЛОВОК:
 * есть ли в нём `«` или слова «диалог|переписк|сообщен|написал|молчани|чат».
 *
 * Замер реестра прода 2026-09-07 показал, почему это не сработало ни разу:
 *
 * | признак               | строк из 226 |
 * |-----------------------|--------------|
 * | заголовок под регулярку |  8 (3,5 %) |
 * | `«` в заголовке        |  6 (2,7 %) |
 * | `«` в ТЕЛЕ поста       | 99 (45 %)  |
 * | реально прикреплено `chat_mockup` | 0 |
 *
 * Персона Ани (B723) ставит цитату собеседника в тело поста, а заголовок несёт
 * поисковый запрос. Признак искали не там, где он есть.
 *
 * Поэтому правило теперь смотрит на тело и ЗАБИРАЕТ ОТТУДА саму реплику: мокап
 * печатает то, что человек действительно написал в переписке, а не SEO-строку
 * заголовка. Заголовочные маркеры оставлены вторым входом — материал, у которого
 * разбор диалога вынесен в заголовок, тоже заслуживает мокапа.
 */

export type CoverLayout = "art" | "chat_mockup";

/** Реплика в кавычках-ёлочках: то, что в посте цитируют как чужие слова. */
const QUOTE_PATTERN = /«\s*([^»]{3,160})\s*»/u;

/** Заголовочные маркеры разбора переписки — второй, более редкий вход. */
const TITLE_DIALOGUE_PATTERN = /диалог|переписк|сообщен|написал|молчани|чат/i;

/**
 * Цитата не должна быть нашим собственным призывом: ссылка в кавычках или
 * название услуги — это не реплика собеседника, и на мокапе она читается ложью.
 */
function isHumanUtterance(quote: string): boolean {
  if (/https?:\/\/|eterapy\.com|utm_/i.test(quote)) return false;
  return quote.trim().length >= 3;
}

/** Реплика из тела материала, если она там есть. */
export function dialogueQuoteFrom(body: string | null | undefined): string | null {
  if (!body) return null;
  const match = QUOTE_PATTERN.exec(body);
  if (!match) return null;
  const quote = match[1].replace(/\s+/g, " ").trim();
  return isHumanUtterance(quote) ? quote : null;
}

/**
 * Раскладка обложки и реплика для неё.
 *
 * `messageText` заполняется только для мокапа: у графической раскладки его
 * некуда положить, и пустое поле честнее выдуманного.
 */
export function coverLayoutFor(input: {
  title: string;
  body?: string | null;
  cluster?: string | null;
}): { layout: CoverLayout; messageText: string | null } {
  const quote = dialogueQuoteFrom(input.body);
  if (quote) {
    return { layout: "chat_mockup", messageText: quote };
  }

  const titleQuote = dialogueQuoteFrom(input.title);
  if (titleQuote) {
    return { layout: "chat_mockup", messageText: titleQuote };
  }

  const markedByTitle = TITLE_DIALOGUE_PATTERN.test(input.title)
    || TITLE_DIALOGUE_PATTERN.test(input.cluster ?? "");
  if (markedByTitle) {
    return { layout: "chat_mockup", messageText: null };
  }

  return { layout: "art", messageText: null };
}
