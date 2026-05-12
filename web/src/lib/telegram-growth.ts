import { mainUrl } from "@/lib/subdomain";

const DEFAULT_BOT_URL = "https://t.me/eterapy_bot";

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
    description: "Быстрый вход в бесплатный Диалог ясности.",
    webPath: "/checkin?channel=telegram_bot&entry=dialogue",
    startPayload: "dialogue",
  },
  {
    key: "practice",
    label: "Практика ясности",
    description: "Карта дня, мягкий ритм и ежедневная практика.",
    webPath: "/practice?channel=telegram_bot&entry=practice",
    startPayload: "practice",
  },
  {
    key: "circle",
    label: "Круг ясности",
    description: "Создать общий вопрос и пригласить 2-5 участников.",
    webPath: "/circle?channel=telegram_bot&entry=circle",
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
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? DEFAULT_BOT_URL;
}

export function getTelegramStartUrl(payload: string) {
  const base = getTelegramBotBaseUrl();
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}start=${encodeURIComponent(payload)}`;
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
