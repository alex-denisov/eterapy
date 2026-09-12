/**
 * B740 — ДВА ИСТОЧНИКА СПРОСА СВОДЯТСЯ В ОДНУ ОЧЕРЕДЬ ФРАЗ.
 *
 * Сбор идёт несколько раз в сутки, а страница пишется не на каждую фразу.
 * Значит между заходами нужна ПАМЯТЬ: без неё агент выбирал бы из той же
 * выдачи заново и рано или поздно написал бы второй раз то, что уже выпустил.
 * Память — таблица `seo_keyword_candidates`, и состояние фразы в ней («новая»,
 * «взята в работу», «закрыта страницей», «отклонена») дороже самой фразы.
 *
 * ⚠ ОТСЕВ ДЕЛАЕТСЯ ЗДЕСЬ, А НЕ В ПРОМТЕ. Фраза вне сферы платформы, фраза с
 * коммерческим намерением чужого бренда и фраза, уже закрытая корпусом, —
 * это три разные причины НЕ ПЛАТИТЬ за вызов модели. Отдать их автору и
 * получить отказ редактора стоило бы два обращения на каждую.
 */

import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { approvedLibraryEntries } from "@/data/anonymous-library";
import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";
import {
  harvestWordstat,
  wordstatConfigured,
  WORDSTAT_HARVEST_MAX_DEMAND,
  WORDSTAT_HARVEST_MIN_DEMAND,
  type HarvestedPhrase,
} from "@/lib/seo/demand/wordstat-harvest";
import { harvestGoogleTrends } from "@/lib/seo/demand/google-trends";

/**
 * Слова, по которым фраза заведомо не наша.
 *
 * Список короткий намеренно. Его задача — снять очевидный мусор выдачи
 * (пиратские скачивания, чужие бренды, «бесплатно онлайн без регистрации»),
 * а не подменить суждение редактора. Длинный стоп-лист отрезал бы живые
 * формулировки людей, ради которых всё и делается.
 */
export const DEMAND_STOP_WORDS = [
  "скачать",
  "торрент",
  "бесплатно без регистрации",
  "порно",
  "секс",
  "казино",
  "ставки",
  "букмекер",
  "займ",
  "кредит наличными",
  "вакансии",
  "работа вахтой",
  "купить",
  "цена",
  "отзывы сотрудников",
  "apk",
  "mod",
  "взлом",
] as const;

/** Минимальная длина фразы в словах: односложное слово — это не запрос, а тема. */
export const DEMAND_MIN_WORDS = 3;
/** Потолок длины: всё длиннее — это уже предложение, а не поисковая фраза. */
export const DEMAND_MAX_WORDS = 12;

export function normalizePhrase(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[«»"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Почему фразу не берём. `null` — берём.
 *
 * Порядок проверок от самой дешёвой к самой дорогой, и это не стиль: отсев по
 * длине стоит наносекунды, а сверка с корпусом — проход по двум сотням строк.
 */
export function rejectReasonFor(input: {
  phrase: string;
  monthlyDemand: number | null;
  source: HarvestedPhrase["source"];
  coveredPhrases: ReadonlySet<string>;
}): string | null {
  const phrase = normalizePhrase(input.phrase);
  const words = phrase.split(" ").filter(Boolean);
  if (words.length < DEMAND_MIN_WORDS) return "слишком короткая фраза — это тема, а не запрос";
  if (words.length > DEMAND_MAX_WORDS) return "слишком длинная фраза — это предложение, а не запрос";
  for (const stop of DEMAND_STOP_WORDS) {
    if (phrase.includes(stop)) return `вне сферы платформы: «${stop}»`;
  }
  if (input.coveredPhrases.has(phrase)) return "запрос уже закрыт корпусом";
  // Порог применяется только там, где частотность ИЗМЕРЕНА. У Trends её нет
  // вовсе, и отбрасывать растущий запрос за «ноль показов» значило бы
  // наказывать фразу за молчание чужого источника.
  if (input.monthlyDemand !== null) {
    if (input.monthlyDemand < WORDSTAT_HARVEST_MIN_DEMAND) {
      return `частотность ${input.monthlyDemand} ниже порога ${WORDSTAT_HARVEST_MIN_DEMAND}`;
    }
    if (input.monthlyDemand > WORDSTAT_HARVEST_MAX_DEMAND) {
      return "головной запрос — его закрывает посадочная услуги, а не карточка";
    }
  }
  return null;
}

/**
 * Что уже закрыто: фразы ядра и вопросы опубликованного корпуса.
 *
 * Нормализуются обе стороны — иначе «Почему он не пишет» и «почему он не
 * пишет» считались бы разными запросами.
 */
export async function coveredPhraseSet(): Promise<Set<string>> {
  const covered = new Set<string>();
  for (const cluster of SEMANTIC_CORE) {
    for (const phrase of cluster.phrases) covered.add(normalizePhrase(phrase.phrase));
  }
  for (const entry of approvedLibraryEntries()) {
    covered.add(normalizePhrase(entry.question));
  }
  const pages = await db.seoLibraryPage
    .findMany({ select: { targetQuery: true, question: true } })
    .catch(() => [] as Array<{ targetQuery: string; question: string }>);
  for (const page of pages) {
    covered.add(normalizePhrase(page.targetQuery));
    covered.add(normalizePhrase(page.question));
  }
  return covered;
}

export interface DemandHarvestResult {
  seen: number;
  accepted: number;
  rejected: number;
  sources: { wordstat: number; googleTrends: number };
}

/**
 * Заход сбора: оба источника, отсев, запись в очередь фраз.
 *
 * ⚠ ПОВТОРНАЯ ВСТРЕЧА ФРАЗЫ — ЭТО СОБЫТИЕ, А НЕ ДУБЛЬ. Строка обновляет
 * `lastSeenAt` и частотность, но НЕ возвращается из `USED` в `NEW`: страница
 * по ней уже вышла, и второй раз писать её нельзя.
 */
export async function harvestSearchDemand(input: { now?: Date } = {}): Promise<DemandHarvestResult> {
  const now = input.now ?? new Date();
  const [wordstat, trends] = await Promise.all([
    wordstatConfigured() ? harvestWordstat({ now }) : Promise.resolve([]),
    harvestGoogleTrends({ now }),
  ]);

  const covered = await coveredPhraseSet();
  const harvested = [...wordstat, ...trends];

  // Внутри одного захода фраза может прийти из обоих источников. Сводим в одну
  // запись здесь, а не перекладыванием в базе: два upsert'а подряд по одному
  // ключу стоили бы лишний запрос и дали бы ту же строку.
  const merged = new Map<string, HarvestedPhrase & { sources: Set<string> }>();
  for (const item of harvested) {
    const key = normalizePhrase(item.phrase);
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { ...item, sources: new Set([item.source]) });
      continue;
    }
    seen.sources.add(item.source);
    if (seen.monthlyDemand === null && item.monthlyDemand !== null) {
      seen.monthlyDemand = item.monthlyDemand;
    }
    if (seen.growth === null && item.growth !== null) seen.growth = item.growth;
  }

  let accepted = 0;
  let rejected = 0;
  for (const [phrase, item] of merged) {
    const reject = rejectReasonFor({
      phrase,
      monthlyDemand: item.monthlyDemand,
      source: item.source,
      coveredPhrases: covered,
    });
    const source = [...item.sources].sort().join("+");
    try {
      await db.seoKeywordCandidate.upsert({
        where: { phrase },
        create: {
          phrase,
          displayPhrase: item.phrase.trim(),
          source,
          monthlyDemand: item.monthlyDemand,
          growth: item.growth,
          cluster: item.cluster,
          service: item.service,
          status: reject ? "REJECTED" : "NEW",
          rejectReason: reject,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: {
          source,
          lastSeenAt: now,
          // Частотность обновляем только живым числом: `null` у Trends не
          // имеет права стереть измеренное значение Wordstat.
          ...(item.monthlyDemand !== null ? { monthlyDemand: item.monthlyDemand } : {}),
          ...(item.growth !== null ? { growth: item.growth } : {}),
        },
      });
      if (reject) rejected += 1;
      else accepted += 1;
    } catch (error) {
      log.warn("seo-demand.candidate_upsert_failed", { phrase, error: serializeError(error) });
    }
  }

  const result: DemandHarvestResult = {
    seen: merged.size,
    accepted,
    rejected,
    sources: { wordstat: wordstat.length, googleTrends: trends.length },
  };
  log.info("seo-demand.harvested", { ...result, sources: { ...result.sources } });
  return result;
}
