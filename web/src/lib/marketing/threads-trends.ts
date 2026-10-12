/**
 * B767 — бесплатные тренды для разведчика Threads, без ключей и платных SERP.
 *
 * Подсказки поиска Яндекса — это запросы, которые люди набирают прямо сейчас:
 * «расклад таро на …», «мой бывший …», «почему он …». Это спрос и боли нашей
 * темы, а не посты чужих блогов. Проверено живым вызовом 2026-10-13:
 * `suggest.yandex.ru/suggest-ff.cgi` отдаёт 10 подсказок без ключа и входа;
 * подсказки Google на русский префикс вернули пусто, Google Trends RSS —
 * мировые новости, к теме не относятся, поэтому не берём.
 *
 * Зёрна — наша тема. Проход разведчика берёт часть зёрен по кругу от даты, чтобы
 * за неделю прошли все.
 */

import { TELEGRAM_TREND_TIMEOUT_MS } from "@/lib/marketing/trend-telegram";

export const TREND_SEEDS: readonly string[] = [
  "расклад таро на ", "гороскоп на ", "мой бывший ", "почему он не ", "совместимость знаков ",
  "ретроград меркурия ", "луна в ", "число судьбы ", "знаки зодиака которые ", "что значит если ",
  "таро да или нет ", "он написал после ", "как забыть ", "карта дня ", "знак зодиака и деньги ",
  "матрица судьбы ", "натальная карта ", "нумерология даты рождения ",
];

const SUGGEST_URL = "https://suggest.yandex.ru/suggest-ff.cgi";
const PHRASES_PER_SEED = 10;
const DAY_MS = 86_400_000;

/** Ответ вида `["префикс", ["подсказка", …]]`; всё прочее — пусто. */
export function parseYandexSuggest(payload: unknown): string[] {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) return [];
  return payload[1].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/** `count` зёрен подряд от номера суток: за `ceil(N/count)` проходов проходят все. */
export function seedsForPass(now: Date, count: number): string[] {
  const start = (Math.floor(now.getTime() / DAY_MS) * count) % TREND_SEEDS.length;
  return Array.from({ length: Math.min(count, TREND_SEEDS.length) }, (_, i) => TREND_SEEDS[(start + i) % TREND_SEEDS.length]);
}

/** По строке на зерно; отказ одного зерна не трогает остальные. */
export async function fetchSuggestTrendTexts(input: {
  seeds: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const call = input.fetchImpl ?? fetch;
  const results = await Promise.allSettled(input.seeds.map(async (seed) => {
    const url = new URL(SUGGEST_URL);
    url.searchParams.set("part", seed);
    url.searchParams.set("n", String(PHRASES_PER_SEED));
    const response = await call(url, { signal: AbortSignal.timeout(TELEGRAM_TREND_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const phrases = parseYandexSuggest(await response.json()).filter((phrase) => phrase.length > seed.trim().length + 2);
    return phrases.length > 0 ? `Запросы людей по «${seed.trim()}»: ${phrases.join("; ")}` : null;
  }));
  return results.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []));
}
