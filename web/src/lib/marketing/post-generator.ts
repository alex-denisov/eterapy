/**
 * B589 фаза 1 · Генератор черновика поста.
 *
 * ПОЧЕМУ ТЕКСТ СОБИРАЕТСЯ ИЗ КАРТОЧКИ, А НЕ ПРИДУМЫВАЕТСЯ МОДЕЛЬЮ. Пост
 * обязан вести на страницу и не должен обещать того, чего на ней нет. Карточка
 * библиотеки уже содержит человеческий вопрос, разворот темы и первый шаг —
 * ровно три части поста. Модель, сочиняющая четвёртую часть от себя, порождает
 * «личный опыт», которого не было: правило B578 запрещает это прямо, а
 * проверить каждый сгенерированный пост глазами при расписании раз в день никто
 * не будет.
 *
 * Поэтому детерминированная сборка: одинаковый вход даёт одинаковый выход,
 * прогон проверяет результат целиком, а не «примерно похоже».
 *
 * ⚠ ГЕНЕРАТОР НИЧЕГО НЕ ПУБЛИКУЕТ. Он возвращает текст; запись в реестр и тем
 * более выход наружу — за вызывающим. Это фаза 1: наружу не уходит ничего.
 */

import { approvedLibraryEntries } from "@/data/anonymous-library";
import type { ContentPlanSlot } from "@/lib/marketing/content-plan";
import { libraryStartParam, telegramDeepLink } from "@/lib/share";
import { compactMarketingUrl } from "@/lib/marketing/link-presentation";

export interface GeneratedPost {
  title: string;
  body: string;
  destinationUrl: string;
  utm: { source: string; medium: string; campaign: string; content: string };
}

const SITE = "https://eterapy.com";

/**
 * UTM канала. `medium=social` у обоих: это одна и та же природа трафика.
 *
 * B719 — `content` здесь остаётся, потому что реестр хранит его отдельным
 * полем и по нему строится сводка. В АДРЕС он больше не попадает: там он
 * дословно повторял слаг из пути и стоил половины хвоста — см.
 * `compactMarketingUrl`.
 */
function utmFor(slot: ContentPlanSlot) {
  return {
    source: slot.channel,
    medium: "social",
    campaign: "library",
    content: slot.articleSlug,
  };
}

export function destinationUrlFor(slot: ContentPlanSlot): string {
  const utm = utmFor(slot);
  const query = new URLSearchParams({
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_content: utm.content,
  });
  const webUrl = compactMarketingUrl(`${SITE}/library/${slot.articleSlug}?${query.toString()}`);
  return slot.channel === "telegram"
    ? telegramDeepLink(libraryStartParam(slot.articleSlug), webUrl)
    : webUrl;
}

/**
 * Собрать черновик.
 *
 * Возвращает `null`, если статьи под слот нет: это ошибка плана, и молча
 * выпускать вместо неё что-то другое нельзя — читатель получит ссылку в никуда.
 */
export function generatePost(slot: ContentPlanSlot): GeneratedPost | null {
  const entry = approvedLibraryEntries().find((card) => card.slug === slot.articleSlug);
  if (!entry) return null;

  const step = entry.freeFragment?.trim();
  const fork = entry.mainFork?.title?.trim();
  const destinationUrl = destinationUrlFor(slot);

  // Зачин — вопрос человека как он есть. Дальше разворот и один шаг, который
  // можно сделать не открывая ссылку: пост обязан быть полезен сам по себе,
  // иначе это объявление, а не материал.
  const lines = [
    entry.question,
    "",
    entry.summary,
  ];
  if (fork) lines.push("", fork);
  if (step) lines.push("", `С чего начать: ${step}`);
  lines.push("", `Разбор целиком: ${destinationUrl}`);

  return {
    title: entry.seo?.metaTitle ?? entry.question,
    body: lines.join("\n"),
    destinationUrl,
    utm: utmFor(slot),
  };
}
