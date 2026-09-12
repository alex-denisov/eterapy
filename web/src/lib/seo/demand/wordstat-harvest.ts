/**
 * B740 — СБОР ЖИВОГО СПРОСА ИЗ WORDSTAT.
 *
 * ⚠ ЭТО НЕ ТО ЖЕ, ЧТО `search-marketing-data.ts`. Тот модуль спрашивает
 * частотность у ТРИНАДЦАТИ головных фраз ядра, чтобы нарисовать панель, и
 * просит `numPhrases: 1` — ему нужен один счётчик на фразу. Здесь задача
 * обратная: узнать, ЧЕМ ЕЩЁ люди спрашивают то же самое. Поэтому `numPhrases`
 * ставится десятками, и берётся не счётчик головной фразы, а её хвост.
 *
 * ФОРМА ЗАПРОСА взята из уже работающего вызова того же API (B578): ключ идёт
 * заголовком `Api-Key`, регион 225 — Россия, `folderId` обязателен. Поле
 * `count` в ответе приходит СТРОКОЙ (проверено живьём в B702 у соседнего
 * метода `dynamics`), поэтому разбор идёт через `Number()`, а не через
 * приведение типа.
 */

import { log, serializeError } from "@/lib/logger";
import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";

const TOP_REQUESTS_URL = "https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests";

/** Сколько хвостовых фраз просим на одну головную. */
export const WORDSTAT_HARVEST_PHRASES_PER_SEED = 40;
/** Сколько головных фраз берём за один заход: один вызов API на фразу. */
export const WORDSTAT_HARVEST_SEEDS_PER_RUN = 4;
/** Ниже этого порога фраза не окупает страницу. Порог тот же, что у ядра. */
export const WORDSTAT_HARVEST_MIN_DEMAND = 100;
/**
 * Выше этого порога фраза почти наверняка головная и уже закрыта посадочной.
 * Писать под неё карточку Библиотеки — значит конкурировать с собственной
 * услугой за один и тот же запрос.
 */
export const WORDSTAT_HARVEST_MAX_DEMAND = 60_000;

export interface HarvestedPhrase {
  /** Фраза в том виде, в каком её отдал источник. */
  phrase: string;
  /** Показов в месяц. `null` — источник молчал; это не ноль. */
  monthlyDemand: number | null;
  /** Рост частотности, если источник его знает. */
  growth: number | null;
  source: "wordstat" | "google-trends";
  /** Головная фраза кластера, от которой фраза найдена. */
  cluster: string;
  /** Услуга кластера — в неё страница будет конвертировать. */
  service: string;
}

export function wordstatConfigured(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return Boolean(env.YANDEX_WORDSTAT_API_KEY?.trim() && env.YANDEX_CLOUD_FOLDER_ID?.trim());
}

/**
 * Хвост головной фразы: `[{phrase, count}]`.
 *
 * Толерантен к обоим именам массива — `results` и `topRequests`: живой ответ
 * отдавал первое, документация обещает второе, и разбор, знающий только одно
 * из них, однажды молча вернёт пусто.
 */
export function parseTopRequests(payload: unknown): Array<{ phrase: string; count: number }> {
  const data = (payload ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data.topRequests)
      ? data.topRequests
      : [];
  return rows
    .map((row) => {
      const item = (row ?? {}) as Record<string, unknown>;
      const phrase = typeof item.phrase === "string" ? item.phrase.trim() : "";
      const count = Number(item.count);
      return { phrase, count: Number.isFinite(count) ? count : 0 };
    })
    .filter((row) => row.phrase.length > 0);
}

/**
 * Какие головные фразы спрашиваем в этот заход.
 *
 * Кластеров тринадцать, вызовов API на заход — четыре. Окно едет по кластерам
 * равномерно вместо случайного выбора: за сутки при четырёх заходах агент
 * обходит ядро целиком, и ни один кластер не оказывается «невезучим».
 */
export function seedWindow(now: Date, size = WORDSTAT_HARVEST_SEEDS_PER_RUN) {
  const clusters = SEMANTIC_CORE.filter((cluster) => cluster.phrases.length > 0);
  if (clusters.length === 0) return [];
  // Номер шестичасового окна с начала эпохи — общий для всех нод флота, поэтому
  // две ноды в одном окне спрашивают одно и то же и не расходуют квоту дважды
  // на разные кластеры.
  const slot = Math.floor(now.getTime() / (6 * 60 * 60_000));
  const offset = (slot * size) % clusters.length;
  return Array.from({ length: Math.min(size, clusters.length) }, (_, index) => {
    const cluster = clusters[(offset + index) % clusters.length];
    return {
      seed: cluster.phrases[0].phrase,
      cluster: cluster.cluster,
      service: cluster.service,
    };
  });
}

async function topRequestsFor(input: {
  seed: string;
  apiKey: string;
  folderId: string;
}): Promise<Array<{ phrase: string; count: number }>> {
  const response = await fetch(TOP_REQUESTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phrase: input.seed,
      numPhrases: WORDSTAT_HARVEST_PHRASES_PER_SEED,
      regions: ["225"],
      folderId: input.folderId,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`wordstat HTTP ${response.status}`);
  return parseTopRequests(await response.json());
}

/**
 * Заход сбора. Никогда не бросает: сбор спроса — не то место, где отказ
 * внешнего источника имеет право уронить проход воркера.
 */
export async function harvestWordstat(input: { now?: Date } = {}): Promise<HarvestedPhrase[]> {
  const apiKey = process.env.YANDEX_WORDSTAT_API_KEY?.trim();
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID?.trim();
  if (!apiKey || !folderId) {
    log.warn("seo-demand.wordstat_not_configured");
    return [];
  }

  const now = input.now ?? new Date();
  const harvested: HarvestedPhrase[] = [];
  for (const target of seedWindow(now)) {
    try {
      const rows = await topRequestsFor({ seed: target.seed, apiKey, folderId });
      for (const row of rows) {
        harvested.push({
          phrase: row.phrase,
          monthlyDemand: row.count > 0 ? row.count : null,
          growth: null,
          source: "wordstat",
          cluster: target.cluster,
          service: target.service,
        });
      }
    } catch (error) {
      log.warn("seo-demand.wordstat_seed_failed", {
        seed: target.seed,
        error: serializeError(error),
      });
    }
  }

  log.info("seo-demand.wordstat_harvested", { phrases: harvested.length });
  return harvested;
}
