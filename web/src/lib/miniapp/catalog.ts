import {
  CHAT_SESSION_COST_CREDITS,
  CHAT_SESSION_MINUTES,
  CHAT_SESSION_PRICE_KOPECKS,
} from "@/lib/chat-session";
import { formatSessionFloor } from "@/lib/session-pricing";
import { v5Products, type V5ProductSlug } from "@/lib/v5-products";
import type { MiniAppService, MiniAppServiceApproach } from "@/lib/miniapp/types";
import { miniAppProductPath } from "@/lib/miniapp/navigation";

const PSYCHOLOGY_PRODUCTS = new Set<V5ProductSlug>([
  "reframe", "deep-report", "chat-analysis", "pair",
]);

function approachFor(slug: V5ProductSlug): MiniAppServiceApproach {
  return PSYCHOLOGY_PRODUCTS.has(slug) ? "psychology" : "symbolic";
}

/**
 * B554 п.22: на карточке мини-аппа помещается примерно две строки, а сюда
 * приходило первое предложение веб-описания — до 148 символов. Подписи
 * обрезались многоточием у 24 элементов сразу, и карточки распухали. Это не
 * задача «поджать шрифт»: тексты переписаны короче, под мобильную карточку.
 * Веб-описания остаются в `v5Products` без изменений.
 */
const MINIAPP_SUMMARY: Partial<Record<V5ProductSlug, string>> = {
  "reframe": "Ситуация под четырьмя углами",
  "deep-report": "Разбор-документ с выводами и шагами",
  "chat-analysis": "Переписка: тон и что стоит за словами",
  "pair": "Один вопрос — несколько взглядов",
  "tarot": "Чтение расклада: позиции и вывод",
  "natal-chart": "Карта неба как язык ваших тем",
  "synastry": "Две карты рядом: сходства и споры",
  "horary": "Точный вопрос — прямой ответ",
  "tarot-numerology": "Арканы вашей даты рождения",
  "numerology": "Матрица 22 энергий по дате рождения",
  "family-scenarios": "Что повторяется в роду",
  "human-design": "Ваш тип и стратегия решений",
  "surname-story": "След рода в вашей фамилии",
};

function compactSummary(slug: V5ProductSlug, summary: string): string {
  const short = MINIAPP_SUMMARY[slug];
  if (short) return short;
  const first = summary.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? summary;
  return first.length > 96 ? `${first.slice(0, 93).trim()}…` : first;
}

const digitalServices: MiniAppService[] = v5Products.map((product) => ({
  id: product.slug,
  slug: product.slug,
  title: product.name,
  eyebrow: product.eyebrow,
  description: compactSummary(product.slug, product.summary),
  price: product.price,
  priceMeta: product.priceMeta,
  creditCost: product.creditCost,
  href: miniAppProductPath(product.slug),
  cta: product.directCta ?? product.cta,
  mechanics: product.mechanics,
  privacy: product.privacy,
  result: product.result,
  approach: approachFor(product.slug),
  format: "digital",
  featured: product.slug === "reframe",
  shareable: product.slug === "pair",
  diaryOnly: product.slug === "family-scenarios",
}));

const primaryService: MiniAppService = {
  id: "primary",
  slug: "primary",
  title: "Первичный разбор",
  eyebrow: "диалог ясности",
  description: "Первый взгляд на ситуацию — бесплатно",
  price: "Бесплатно",
  priceMeta: "без карты и подписки",
  creditCost: null,
  href: "/miniapp/checkin",
  cta: "Задать вопрос",
  mechanics: ["вопрос своими словами", "короткие уточнения", "первичный взгляд", "следующий шаг"],
  privacy: "Вопрос не публикуется и доступен только в вашем диалоге.",
  result: "Первичный взгляд на ситуацию и один безопасный следующий шаг.",
  approach: "psychology",
  format: "digital",
};

const chatService: MiniAppService = {
  id: "chat-session", slug: "chat-session", title: "Решить вопрос в чате",
  eyebrow: "живой диалог в своём темпе",
  description: `Диалог вокруг одного вопроса в течение ${CHAT_SESSION_MINUTES} минут.`,
  price: `${(CHAT_SESSION_PRICE_KOPECKS / 100).toLocaleString("ru-RU")} ₽`,
  priceMeta: `или −${CHAT_SESSION_COST_CREDITS} балла`, creditCost: CHAT_SESSION_COST_CREDITS,
  href: "/miniapp/products/chat", cta: "Начать чат",
  mechanics: ["короткое бесплатное начало", "45 минут разговора", "уточнения в своём темпе", "итог в Дневнике"],
  privacy: "Диалог остаётся в вашем аккаунте.",
  result: "Разговор вокруг одного вопроса с зафиксированным итогом.",
  approach: "psychology", format: "digital",
};

const specialistService: MiniAppService = {
  id: "specialist", slug: "specialist", title: "Поговорить с человеком",
  eyebrow: "проверенные специалисты",
  description: "Психолог, коуч или практик онлайн. Цена и формат видны до записи.",
  price: formatSessionFloor(), priceMeta: "60 минут", creditCost: null,
  href: "/miniapp/practitioners", cta: "Выбрать специалиста",
  mechanics: ["выбор направления", "проверенный профиль", "свободное время", "онлайн-встреча"],
  privacy: "Запись и материалы встречи доступны только вам и выбранному специалисту.",
  result: "Живой разговор и возможность продолжить с тем же специалистом.",
  approach: "mixed", format: "specialist",
};

export const MINIAPP_SERVICES: readonly MiniAppService[] = [
  primaryService,
  ...digitalServices.filter((service) => !service.diaryOnly),
  chatService,
  specialistService,
];

export const MINIAPP_DIARY_SERVICE = digitalServices.find(
  (service) => service.slug === "family-scenarios",
) ?? null;

export function miniAppService(id: string): MiniAppService | null {
  return MINIAPP_SERVICES.find((service) => service.id === id) ??
    (MINIAPP_DIARY_SERVICE?.id === id ? MINIAPP_DIARY_SERVICE : null);
}
