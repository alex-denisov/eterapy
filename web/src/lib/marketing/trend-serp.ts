/**
 * B702 фаза 6 — темы из поисковой выдачи.
 *
 * Владелец 2026-08-11: «никто не отбирал у тебя поиск в интернете через
 * поисковик, а не напрямую в ресурсах медиа/площадок». Ходим в Яндекс SearchAPI
 * тем же ключом, что и Wordstat.
 *
 * ЧТО СЧИТАЕТСЯ ТРЕНДОМ. Не всё подряд из выдачи: формулировка, которая уже
 * есть в семантическом ядре, трендом быть не может — её спрос планировщик и так
 * учитывает (фаза 1). Кандидат — частая формулировка выдачи, которой в ядре
 * ЕЩЁ НЕТ: ровно «новые и актуальные темы/вопросы» из требования.
 *
 * ФОРМА ОТВЕТА ПРОВЕРЕНА ЖИВЬЁМ (прод, 2026-08-11): `POST /v2/web/search`
 * отдаёт `{ rawData: <XML в base64> }`, а не готовый JSON со списком.
 */

import { log, serializeError } from "@/lib/logger";
import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";
import type { TrendCandidate } from "@/lib/marketing/trend-scan";

const SEARCH_URL = "https://searchapi.api.cloud.yandex.net/v2/web/search";

/** В скольких РАЗНЫХ результатах должна встретиться формулировка. */
export const SERP_TREND_MIN_RESULTS = 2;
/** Сколько запросов делаем за заход: один вызов API на фразу. */
export const SERP_TREND_PHRASE_LIMIT = 5;
/** Сколько тем отдаёт источник. */
export const SERP_TREND_TOPIC_LIMIT = 10;
/** Сколько держим ответ в памяти процесса. */
export const SERP_TREND_CACHE_MS = 6 * 60 * 60 * 1_000;

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;

/**
 * Короче трёх букв значимых слов не бывает, а вот трёхбуквенные в нашей теме
 * есть и они важны: «код», «сон», «муж», «дом». Порог 4 их вырезал и превращал
 * «финансовый код рождения» в «финансовый рождения».
 */
const MIN_TOKEN_LENGTH = 3;

/**
 * Служебные слова выдачи. Кроме обычных предлогов сюда входит лексика
 * заголовков («онлайн», «бесплатно», «читать»): она встречается в каждом втором
 * результате и объявила бы трендом саму себя.
 */
const STOP_WORDS = new Set([
  "как", "что", "чем", "где", "когда", "почему", "зачем", "если", "или", "для",
  "про", "при", "над", "под", "без", "это", "этот", "эта", "эти", "так", "тоже",
  "уже", "ещё", "еще", "все", "всё", "быть", "было", "были", "есть", "может",
  "можно", "нужно", "надо", "свой", "своя", "мой", "моя", "твой", "наш", "ваш",
  "онлайн", "бесплатно", "бесплатный", "читать", "смотреть", "сайт", "отзывы",
  "цена", "купить", "заказать", "лучший", "топ", "фото", "видео", "года",
]);

/**
 * Домены, чья выдача — товар, а не тема.
 *
 * Живой прогон на проде 2026-08-11 по запросу «таро» вернул «бесплатная
 * доставка», «интернет магазине», «магазине wildberries», «низкой цене»:
 * маркетплейсы продают колоды, и лексика витрины повторяется в каждом
 * результате, то есть проходит любой порог частоты. Отсекать надо ИСТОЧНИК, а
 * не слова: список слов бесконечен, список витрин — нет.
 */
const SHOP_DOMAIN = /wildberries|ozon\.|market\.yandex|avito|aliexpress|lamoda|sbermegamarket|dns-shop|citilink|megamarket|shop\.|\.shop|magazin|labirint|chitai-gorod/i;

/** Результаты, пришедшие с витрин: их тексты в разбор не идут. */
function withoutShops(xml: string): string {
  const docs = [...xml.matchAll(/<doc\b[\s\S]*?<\/doc>/g)].map((match) => match[0]);
  if (docs.length === 0) return xml;
  return docs.filter((doc) => {
    const domain = /<domain>([\s\S]*?)<\/domain>/.exec(doc)?.[1] ?? "";
    return !SHOP_DOMAIN.test(domain);
  }).join("");
}

/** Тексты результатов: заголовки и врезки, разметка подсветки снята, витрины выброшены. */
export function parseSerpTexts(xml: string): string[] {
  const texts: string[] = [];
  for (const match of withoutShops(xml).matchAll(/<(title|passage)>([\s\S]*?)<\/\1>/g)) {
    const text = match[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (text) texts.push(text);
  }
  return texts;
}

function meaningfulTokens(text: string): string[] {
  return text
    .toLocaleLowerCase("ru-RU")
    .split(TOKEN_SPLIT)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token));
}

/** Один стем — тот же, что у остального маркетингового разбора. */
function stemOf(token: string): string {
  return token.length >= 5 ? token.slice(0, -1) : token;
}

function normalized(topic: string): string {
  return topic.split(" ").map(stemOf).join(" ");
}

const CORE_PHRASES = SEMANTIC_CORE.flatMap((cluster) => cluster.phrases.map((phrase) => phrase.phrase));

/** Биграммы, встречающиеся в разных результатах и отсутствующие в ядре. */
export function freshTopics(
  texts: string[],
  corePhrases: string[],
  minResults = SERP_TREND_MIN_RESULTS,
): Array<{ topic: string; results: number }> {
  const known = new Set<string>();
  for (const phrase of corePhrases) {
    const tokens = meaningfulTokens(phrase);
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      known.add(normalized(`${tokens[index]} ${tokens[index + 1]}`));
    }
  }

  const counts = new Map<string, number>();
  for (const text of texts) {
    const tokens = meaningfulTokens(text);
    const seen = new Set<string>();
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      seen.add(`${tokens[index]} ${tokens[index + 1]}`);
    }
    for (const topic of seen) {
      if (known.has(normalized(topic))) continue;
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, results]) => results >= minResults)
    .map(([topic, results]) => ({ topic, results }))
    .sort((left, right) => right.results - left.results || left.topic.localeCompare(right.topic));
}

let cache: { at: number; candidates: TrendCandidate[] } | null = null;

/**
 * Свежие формулировки выдачи как кандидаты-тренды.
 *
 * Один вызов API на фразу, поэтому список коротко ограничен, а ответ держится в
 * памяти процесса шесть часов. Отказ по одной фразе не отменяет остальные —
 * общее правило всех источников трендов.
 */
export async function serpTrends(input: {
  fetchImpl?: typeof fetch;
  phrases?: string[];
  apiKey?: string;
  folderId?: string;
  corePhrases?: string[];
  now?: Date;
  useCache?: boolean;
} = {}): Promise<TrendCandidate[]> {
  const apiKey = input.apiKey ?? process.env.YANDEX_WORDSTAT_API_KEY ?? "";
  const folderId = input.folderId ?? process.env.YANDEX_CLOUD_FOLDER_ID ?? "";
  if (!apiKey || !folderId) return [];

  const useCache = input.useCache ?? true;
  const now = input.now ?? new Date();
  if (useCache && cache && now.getTime() - cache.at < SERP_TREND_CACHE_MS) return cache.candidates;

  const phrases = (input.phrases ?? headPhrases()).slice(0, SERP_TREND_PHRASE_LIMIT);
  const corePhrases = input.corePhrases ?? CORE_PHRASES;
  const call = input.fetchImpl ?? fetch;

  const answers = await Promise.allSettled(phrases.map(async (queryText) => {
    const response = await call(SEARCH_URL, {
      method: "POST",
      headers: { Authorization: `Api-Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: { searchType: "SEARCH_TYPE_RU", queryText },
        folderId,
        responseFormat: "FORMAT_XML",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`SearchAPI ${queryText}: HTTP ${response.status}`);
    const payload = await response.json() as { rawData?: string };
    if (!payload.rawData) return { queryText, texts: [] as string[] };
    return { queryText, texts: parseSerpTexts(Buffer.from(payload.rawData, "base64").toString("utf8")) };
  }));

  const candidates: TrendCandidate[] = [];
  for (const answer of answers) {
    if (answer.status !== "fulfilled") {
      log.warn("marketing.trend_serp_failed", { error: serializeError(answer.reason) });
      continue;
    }
    for (const found of freshTopics(answer.value.texts, corePhrases)) {
      candidates.push({
        topic: found.topic,
        rationale: `Встречается в ${found.results} результатах выдачи по «${answer.value.queryText}» и отсутствует в ядре.`,
        // Место источника в контракте — то же, что было зарезервировано под
        // поисковые подсказки: это тот же вход «что сейчас в поиске».
        source: "searchSuggestions",
        keywords: found.topic.split(" "),
      });
    }
  }

  const result = candidates.slice(0, SERP_TREND_TOPIC_LIMIT);
  if (useCache) cache = { at: now.getTime(), candidates: result };
  return result;
}

function headPhrases(): string[] {
  return SEMANTIC_CORE
    .map((cluster) => cluster.phrases[0]?.phrase)
    .filter((phrase): phrase is string => Boolean(phrase));
}

/** Сбросить память процесса — только для прогонов. */
export function resetSerpTrendCache(): void {
  cache = null;
}
