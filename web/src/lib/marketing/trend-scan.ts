/**
 * B702 фаза 2 — живые тренды как второй вход планировщика тем.
 *
 * Фаза 1 считает спрос по готовым источникам (ядро, wordstat, Вебмастер, GSC).
 * Фаза 2 ищет то, чего в этих таблицах ещё нет: темы, которые становятся
 * актуальными ПРЯМО СЕЙЧАС — живые публичные обсуждения, динамика wordstat,
 * поисковые подсказки.
 *
 * Сканер — оркестратор, а не сборщик каждого источника: источник объявлен
 * чистой функцией «вернуть кандидатов», а сканер зовёт их allSettled.
 * Недоступный источник (нет ключа, площадка отдала ошибку) возвращает пусто и
 * не валит остальных — это требование теста, а не любезность: планировщик
 * должен работать при любой погоде, иначе мы вернулись к «плана нет вовсе».
 */

import { discoverCandidates } from "@/lib/marketing/discovery";
import { telegramChannelTrends } from "@/lib/marketing/trend-telegram";
import { serpTrends } from "@/lib/marketing/trend-serp";
import { wordstatDynamicsTrends } from "@/lib/marketing/trend-wordstat";

/** Откуда пришёл тренд. */
export type TrendSourceId =
  | "discovery"
  | "telegramChannels"
  | "wordstatDynamics"
  | "searchSuggestions";

export interface TrendCandidate {
  /** Человекочитаемая тема для поста. */
  topic: string;
  /** Одно-два предложения-обоснования, почему тема живая. */
  rationale: string;
  source: TrendSourceId;
  /** Оригинальная публикация/фраза-источник. */
  referenceUrl?: string;
  /** Ключевые слова кандидата для сопоставления со спросом. */
  keywords: string[];
}

export type TrendSource = () => Promise<TrendCandidate[]>;

/** Сколько кандидатов максимум возвращает один источник. */
export const TREND_SOURCE_CANDIDATE_LIMIT = 10;
/** Сколько кандидатов максимум отдаёт сканер целиком. */
export const TREND_SCAN_LIMIT = 15;
/**
 * Сколько сканер ждёт один источник.
 *
 * Не любезность, а граница ответственности: источники discovery ходят в сеть
 * последовательно и БЕЗ `AbortSignal`, а сканер зовётся внутри крон-прохода
 * генерации. Молчащая сеть у источника трендов не имеет права держать
 * конвейер — тренд это подсказка, а не условие выпуска.
 */
export const TREND_SOURCE_TIMEOUT_MS = 20_000;

/**
 * Живые публичные обсуждения (VK/Threads).
 *
 * `discoverCandidates` возвращает кандидатов discovery (уже отфильтрованных по
 * словарю тем). Сканер не пишет их в реестр и не занимает слоты — это его
 * отличие от `runEngagementDiscovery`.
 */
async function discoverySource(): Promise<TrendCandidate[]> {
  const candidates = await discoverCandidates();
  return candidates.slice(0, TREND_SOURCE_CANDIDATE_LIMIT).map((candidate) => ({
    topic: candidate.topic,
    rationale: `Живое обсуждение в публичной ленте (${candidate.platform}).`,
    source: "discovery" as const,
    referenceUrl: candidate.targetUrl,
    keywords: candidate.topic.split(/\s+/).filter(Boolean),
  }));
}

/**
 * Открытые Telegram-каналы (публичная веб-версия ленты).
 *
 * Разбор и правило отбора — в `trend-telegram.ts`. Здесь источник только
 * объявлен: пустая настройка каналов означает пустой список, а не отказ.
 */
async function telegramChannelsSource(): Promise<TrendCandidate[]> {
  return telegramChannelTrends();
}

/**
 * Динамика wordstat: рост частотности за недели.
 *
 * Разбор и порог роста — в `trend-wordstat.ts`. Нет ключа — источник молчит,
 * как и любой другой ненастроенный.
 */
async function wordstatDynamicsSource(): Promise<TrendCandidate[]> {
  return wordstatDynamicsTrends();
}

/**
 * Поисковая выдача: формулировки, которых ещё нет в ядре.
 *
 * Место в контракте было зарезервировано под подсказки (suggest); у того
 * эндпоинта нет официального ключа, зато есть Яндекс SearchAPI — тот же вход
 * «что сейчас в поиске», только законным путём. Разбор — в `trend-serp.ts`.
 */
async function searchSuggestionsSource(): Promise<TrendCandidate[]> {
  return serpTrends();
}

const TREND_SOURCES: readonly TrendSource[] = [
  discoverySource,
  telegramChannelsSource,
  wordstatDynamicsSource,
  searchSuggestionsSource,
];

/**
 * Источник со сроком. Просрочка отдаётся как отказ — `allSettled` в сканере
 * обходится с ней ровно как с любым другим сбоем источника. Таймер снимается в
 * `finally`, иначе он держал бы процесс живым после ответа источника.
 */
async function withDeadline(source: TrendSource, timeoutMs: number): Promise<TrendCandidate[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      source(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Источник трендов не ответил за ${timeoutMs} мс`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Собрать живые кандидаты-темы из всех доступных источников.
 *
 * Каждый источник вызывается через allSettled: сбой одного (сеть, отменённое
 * право, не настроенный ключ) не рвёт остальных. Кандидаты дедуплицируются по
 * теме и ограничиваются сверху — планировщику не нужен поток, ему нужен
 * управляемый вход. `sources` передаётся тестам; продакшн использует
 * фиксированный список `TREND_SOURCES`.
 */
export async function scanTrends(
  input: { limit?: number; sources?: readonly TrendSource[]; timeoutMs?: number } = {},
): Promise<TrendCandidate[]> {
  const limit = input.limit ?? TREND_SCAN_LIMIT;
  const sources = input.sources ?? TREND_SOURCES;
  const timeoutMs = input.timeoutMs ?? TREND_SOURCE_TIMEOUT_MS;
  const groups = await Promise.allSettled(sources.map((source) => withDeadline(source, timeoutMs)));
  const seen = new Set<string>();
  const candidates: TrendCandidate[] = [];
  for (const group of groups) {
    if (group.status !== "fulfilled") continue;
    for (const candidate of group.value) {
      const key = candidate.topic.toLocaleLowerCase("ru-RU").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
      if (candidates.length >= limit) return candidates;
    }
  }
  return candidates;
}
