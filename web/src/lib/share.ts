// B390 (M26) — вирусные поверхности: шеринг артефактов + TG deep-links.
// Чистые хелперы (без React/DOM): сборка ссылок шеринга, OG-картинок и deep-link
// в мини-апп, плюс имена аналитических событий KPI-петли (K-reg 0.15–0.5).

export const SHARE_EVENTS = {
  generated: "share_generated",
  opened: "share_opened",
  referredDialogue: "referred_dialogue_started",
} as const;

export type ShareArtifactKind = "library" | "human-design" | "surname-story" | "weekly-summary" | "insight";

// Декоративная OG-картинка по типу артефакта. Текст артефакта едет в og:title/
// og:description (соцсеть рисует его своим шрифтом — кириллица без проблем),
// поэтому в самой картинке кириллицы нет — только бренд-мотив.
export function ogImageUrl(kind: ShareArtifactKind): string {
  return `/api/og?kind=${encodeURIComponent(kind)}`;
}

const REF_PARAM = "ref";

// Пометить ссылку как пришедшую из шеринга (для аналитики реферального диалога).
export function withReferral(url: string, source: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${REF_PARAM}=${encodeURIComponent(source)}`;
}

// Telegram deep-link в мини-апп: t.me/<bot>/<app>?startapp=<param>. Если адрес
// мини-аппа не сконфигурирован (env), отдаём обычный web-URL — он тоже откроется.
export function telegramDeepLink(startParam: string, webFallbackUrl: string): string {
  const base = process.env.NEXT_PUBLIC_TG_MINIAPP_URL?.trim();
  if (!base) return webFallbackUrl;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}startapp=${encodeURIComponent(startParam)}`;
}

// startapp-параметр для карточки библиотеки. Слаги url-safe (a-z0-9-), так что
// «lib-<slug>» однозначно разбирается обратно (всё после «lib-» — это слаг).
export function libraryStartParam(slug: string): string {
  return `lib-${slug}`;
}

// Текст для кнопки «Поделиться» по типу артефакта.
export function shareText(kind: ShareArtifactKind, headline: string): string {
  switch (kind) {
    case "human-design":
      return `${headline} — узнайте свой тип в Дизайне человека бесплатно:`;
    case "surname-story":
      return `${headline} — узнайте историю своей фамилии бесплатно:`;
    case "weekly-summary":
      return `Мой итог недели в ETerapy. Сделайте свой:`;
    case "insight":
      return `${headline}`;
    case "library":
    default:
      return `${headline} — разберите свой вопрос бережно:`;
  }
}
