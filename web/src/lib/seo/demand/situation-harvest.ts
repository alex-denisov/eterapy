/**
 * B750 — СБОР ОТ СИТУАЦИИ: СНАЧАЛА ЧЕЛОВЕК, ПОТОМ СЛОВО.
 *
 * Расширение Wordstat по головному слову отдаёт то, что люди ищут ВОКРУГ слова
 * (сериалы, игры, политика). Здесь порядок обратный: модель пула пишет фразы, как
 * их набирает человек, ПОПАВШИЙ в ситуацию кластера, а Wordstat только
 * измеряет, ищет ли их кто-нибудь. Фраза без измеренного спроса в очередь не
 * попадает: придуманное моделью не равно тому, что ищут.
 *
 * ⚠ КВОТА WORDSTAT — 100 ЗАПРОСОВ В ЧАС. За заход меряем не больше
 * `SITUATION_MEASURE_LIMIT` фраз, на первом 429 останавливаемся: остаток
 * доберёт следующий заход, а упираться в закрытую дверь значит терять квоту
 * основного сбора.
 *
 * Никогда не бросает: сбор спроса не имеет права уронить проход воркера.
 */

import { AIProvider } from "@prisma/client";
import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";
import { SEO_DEMAND_FLOOR } from "@/lib/seo/demand-ladder";
import { marketingPoolAvailability } from "@/lib/marketing/pool-capacity";
import { marketingProviderOrder, SEO_LIBRARY_WRITER_FEATURE } from "@/lib/marketing/model-pool";
import {
  coveredPhraseSet,
  normalizePhrase,
  rejectReasonFor,
} from "@/lib/seo/demand/harvest";
import { duplicateOf } from "@/lib/seo/demand/duplicates";
import { liveTopicPhrases } from "@/lib/seo/demand/relevance-cleanup";
import { topRequestsFor, wordstatConfigured } from "@/lib/seo/demand/wordstat-harvest";

export const SITUATION_PHRASES_PER_CLUSTER = 25;
/** 100 запросов в час на весь ключ; основной сбор берёт ~16 за заход. */
export const SITUATION_MEASURE_LIMIT = 24;
export const SITUATION_MIN_WORDS = 3;
export const SITUATION_MAX_WORDS = 9;
const MAX_MODEL_ATTEMPTS = 3;

export interface SituationCluster {
  cluster: string;
  service: string;
}

export interface SituationHarvestDeps {
  /** Текст ответа модели по кластеру; бросает при отказе всех маршрутов. */
  generate: (cluster: SituationCluster) => Promise<string>;
  /** Частота фразы в Wordstat; бросает ошибку с «HTTP 429» при исчерпании квоты. */
  measure: (phrase: string) => Promise<number>;
  covered: () => Promise<ReadonlySet<string>>;
  /** Живые намерения очереди и страниц; по ним отсекаются дубли темы. */
  liveTopics?: () => Promise<string[]>;
  /** Какие из фраз уже есть в таблице (любой статус) — их не измеряем заново. */
  known: (phrases: string[]) => Promise<ReadonlySet<string>>;
  save: (row: {
    phrase: string;
    displayPhrase: string;
    monthlyDemand: number;
    cluster: string;
    service: string;
    now: Date;
  }) => Promise<void>;
}

export interface SituationHarvestResult {
  cluster: string | null;
  proposed: number;
  filtered: number;
  measured: number;
  accepted: number;
  quotaStopped: boolean;
}

const EMPTY: SituationHarvestResult = {
  cluster: null,
  proposed: 0,
  filtered: 0,
  measured: 0,
  accepted: 0,
  quotaStopped: false,
};

/**
 * Вид фразы для сверки с Wordstat: у него нет пунктуации и «ё» заменена на «е».
 * Без этого «муж изменил, что делать» не находил бы свою строку и получал
 * частоту 0. Нормализуются ОБЕ стороны сравнения.
 */
export function normalizeWordstatPhrase(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[,;:.!?—–\-«»"'`()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Частота строки, чья нормализованная форма равна фразе; нет строки — 0. */
export function countForPhrase(rows: ReadonlyArray<{ phrase: string; count: number }>, phrase: string): number {
  const target = normalizeWordstatPhrase(phrase);
  return rows.find((row) => normalizeWordstatPhrase(row.phrase) === target)?.count ?? 0;
}

/** Один кластер на заход, по часу суток: за сутки обходим весь список. */
export function clusterForRun<T>(now: Date, clusters: readonly T[]): T | null {
  if (clusters.length === 0) return null;
  const hourIndex = Math.floor(now.getTime() / 3_600_000);
  return clusters[hourIndex % clusters.length];
}

export function situationClusters(): SituationCluster[] {
  return SEMANTIC_CORE.map((c) => ({ cluster: c.cluster, service: c.service }));
}

/** Защитный разбор: JSON-массив строк, в том числе внутри ```-ограды или с прозой вокруг. */
export function parseSituationPhrases(text: string): string[] {
  if (!text) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      const raw = typeof item === "string" ? item : (item as { phrase?: unknown } | null)?.phrase;
      if (typeof raw !== "string") continue;
      const phrase = normalizeWordstatPhrase(raw);
      if (phrase && !out.includes(phrase)) out.push(phrase);
    }
    return out;
  } catch {
    return [];
  }
}

export function situationPrompt(cluster: SituationCluster): { system: string; user: string } {
  return {
    system: [
      "Ты помогаешь составить семантику для сервиса личных разборов жизненных ситуаций.",
      "Отвечай только JSON-массивом строк, без пояснений.",
      "ЗАПРЕЩЕНО: имена публичных людей и фамилии, политика и война, спорт, юридические советы и кодексы,",
      "порнография, кино, сериалы, игры, манга, шоу, развлекательные гороскопы и «предсказания на год».",
    ].join(" "),
    user: [
      `Направление: «${cluster.cluster}».`,
      `Напиши ${SITUATION_PHRASES_PER_CLUSTER} разных поисковых фраз по-русски, как их набирают в Яндексе,`,
      `${SITUATION_MIN_WORDS}–${SITUATION_MAX_WORDS} слов каждая. Это человек, который находится в жизненной ситуации`,
      "по этому направлению и хочет, чтобы её объяснили или помогли разобраться.",
      "Примеры формы: «муж изменил что делать», «к чему снится бывший муж», «как понять что он меня не любит».",
      "Формулировки от первого лица и вопросом. Без дат, без цифр, без имён.",
      'Формат ответа: ["фраза 1", "фраза 2", ...]',
    ].join(" "),
  };
}

async function generateWithPool(cluster: SituationCluster, now: Date): Promise<string> {
  const availability = await marketingPoolAvailability(now).catch(() => null);
  const available = availability?.providers ?? [];
  if (available.length === 0) throw new Error("пул моделей недоступен");
  const order = marketingProviderOrder(`situation:${cluster.cluster}:${now.toISOString()}`, [], available, {
    role: "writer",
  });
  const prompt = situationPrompt(cluster);
  const failures: string[] = [];
  for (const provider of order.slice(0, MAX_MODEL_ATTEMPTS)) {
    try {
      const response = await aiComplete({
        feature: SEO_LIBRARY_WRITER_FEATURE,
        dataClass: "PUBLIC_MARKETING",
        providerOrder: [provider as AIProvider],
        maxTokens: 2000,
        temperature: 0.9,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      });
      if (parseSituationPhrases(response.text).length > 0) return response.text;
      failures.push(`${provider}: ответ не разобран`);
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`ни один маршрут пула не ответил: ${failures.join("; ") || "нет"}`);
}

function defaultDeps(now: Date): SituationHarvestDeps {
  return {
    generate: (cluster) => generateWithPool(cluster, now),
    measure: async (phrase) => {
      const rows = await topRequestsFor({
        seed: phrase,
        apiKey: process.env.YANDEX_WORDSTAT_API_KEY?.trim() ?? "",
        folderId: process.env.YANDEX_CLOUD_FOLDER_ID?.trim() ?? "",
        numPhrases: 5,
      });
      return countForPhrase(rows, phrase);
    },
    covered: () => coveredPhraseSet(),
    liveTopics: () => liveTopicPhrases({ includeNew: true }),
    known: async (phrases) => {
      const rows = await db.seoKeywordCandidate.findMany({
        where: { phrase: { in: phrases } },
        select: { phrase: true },
      });
      return new Set(rows.map((row) => row.phrase));
    },
    save: async (row) => {
      await db.seoKeywordCandidate.upsert({
        where: { phrase: row.phrase },
        create: {
          phrase: row.phrase,
          displayPhrase: row.displayPhrase,
          source: "situation",
          monthlyDemand: row.monthlyDemand,
          cluster: row.cluster,
          service: row.service,
          status: "NEW",
          firstSeenAt: row.now,
          lastSeenAt: row.now,
        },
        update: { lastSeenAt: row.now },
      });
    },
  };
}

export async function harvestSituations(
  input: { now?: Date; deps?: SituationHarvestDeps; clusters?: readonly SituationCluster[] } = {},
): Promise<SituationHarvestResult> {
  const now = input.now ?? new Date();
  const target = clusterForRun(now, input.clusters ?? situationClusters());
  if (!target) return EMPTY;
  if (!input.deps && !wordstatConfigured()) return { ...EMPTY, cluster: target.cluster };

  const deps = input.deps ?? defaultDeps(now);
  const result: SituationHarvestResult = { ...EMPTY, cluster: target.cluster };
  try {
    const proposed = parseSituationPhrases(await deps.generate(target));
    result.proposed = proposed.length;
    const covered = await deps.covered();
    const liveTopics = deps.liveTopics ? await deps.liveTopics().catch(() => [] as string[]) : [];

    const candidates: string[] = [];
    for (const phrase of proposed) {
      const words = phrase.split(" ").filter(Boolean).length;
      // Спрос на этом шаге ещё не измерен — отсев по частоте делаем после.
      const reject =
        words < SITUATION_MIN_WORDS || words > SITUATION_MAX_WORDS
          ? "длина"
          : rejectReasonFor({ phrase, monthlyDemand: null, source: "wordstat", coveredPhrases: covered, liveTopics: [...liveTopics, ...candidates] });
      if (reject) result.filtered += 1;
      else candidates.push(phrase);
    }

    const known = await deps.known(candidates);
    const fresh = candidates.filter((phrase) => !known.has(phrase)).slice(0, SITUATION_MEASURE_LIMIT);

    const savedThisRun: string[] = [];
    for (const phrase of fresh) {
      let demand: number;
      try {
        demand = await deps.measure(phrase);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("429")) {
          result.quotaStopped = true;
          break;
        }
        log.warn("seo-situation.measure_failed", { phrase, error: serializeError(error) });
        continue;
      }
      result.measured += 1;
      if (demand < SEO_DEMAND_FLOOR) continue;
      // Верхний потолок («головной запрос») проверяем теми же правилами, что и сбор.
      if (rejectReasonFor({ phrase, monthlyDemand: demand, source: "wordstat", coveredPhrases: covered })) continue;
      // Внутри захода два близких намерения тоже не берём: первое сохранённое выигрывает.
      if (duplicateOf(phrase, savedThisRun)) continue;
      try {
        await deps.save({
          phrase,
          displayPhrase: phrase,
          monthlyDemand: demand,
          cluster: target.cluster,
          service: target.service,
          now,
        });
        savedThisRun.push(phrase);
        result.accepted += 1;
      } catch (error) {
        log.warn("seo-situation.save_failed", { phrase, error: serializeError(error) });
      }
    }
  } catch (error) {
    log.warn("seo-situation.failed", { cluster: target.cluster, error: serializeError(error) });
  }
  log.info("seo-situation.harvested", { ...result });
  return result;
}
