import { mainUrl } from "@/lib/subdomain";
import { TELEGRAM_BOT_URL } from "@/lib/env";

export type TelegramGrowthEntry = {
  key: "dialogue" | "practice" | "circle" | "pair";
  label: string;
  description: string;
  webPath: string;
  startPayload: string;
};

export const TELEGRAM_GROWTH_ENTRIES: TelegramGrowthEntry[] = [
  {
    key: "dialogue",
    label: "Начать диалог",
    description: "Быстрый вход в бесплатный разбор.",
    webPath: "/checkin?channel=telegram_bot&entry=dialogue",
    startPayload: "dialogue",
  },
  {
    key: "practice",
    label: "Ежедневная практика",
    description: "Карта дня, мягкий ритм и ежедневная практика.",
    webPath: "/practice?channel=telegram_bot&entry=practice",
    startPayload: "practice",
  },
  {
    // B385: «Круг» закрыт и слит в «Вместе»; payload "circle" сохранён для
    // обратной совместимости старых deep-link, но ведёт на /pair.
    key: "circle",
    label: "Вместе",
    description: "Позвать близкого за взглядом со стороны по ссылке или сверить взгляды.",
    webPath: "/pair?channel=telegram_bot&entry=together",
    startPayload: "circle",
  },
  {
    key: "pair",
    label: "Разобраться вдвоём",
    description: "Парный сценарий с отдельными ответами и согласием.",
    webPath: "/pair?channel=telegram_bot&entry=pair",
    startPayload: "pair",
  },
];

export function getTelegramBotBaseUrl() {
  return TELEGRAM_BOT_URL;
}

export function getTelegramStartUrl(payload: string) {
  const base = getTelegramBotBaseUrl();
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}start=${encodeURIComponent(payload)}`;
}

/**
 * Adds stable first-party attribution to Bot API Mini App buttons without
 * overwriting an explicitly configured campaign. Telegram's profile-level
 * Main Mini App does not expose its URL through Bot API, so runtime analytics
 * also records the detected messenger platform (see MiniAppShell).
 */
export function getTrackedTelegramMiniAppUrl(rawUrl: string, entry: "bot_menu" | "bot_welcome") {
  const url = new URL(rawUrl);
  const defaults = {
    miniapp: "telegram",
    source: "telegram",
    channel: "telegram_bot",
    entry,
    utm_source: "telegram",
    utm_medium: "bot",
    utm_campaign: "miniapp",
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function resolveTelegramGrowthPayload(payload: string | undefined | null) {
  if (!payload) return null;
  const normalized = payload.trim().toLowerCase().replace(/^tg_/, "");
  return TELEGRAM_GROWTH_ENTRIES.find((entry) => entry.startPayload === normalized) ?? null;
}

export function formatTelegramGrowthMessage(entry: TelegramGrowthEntry) {
  return [
    `${entry.label}`,
    entry.description,
    "",
    `<a href="${mainUrl(entry.webPath)}">Открыть в ETerapy</a>`,
  ].join("\n");
}
