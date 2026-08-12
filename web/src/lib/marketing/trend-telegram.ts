/**
 * B702 фаза 6 — живые темы из открытых Telegram-каналов.
 *
 * ПОЧЕМУ ВЕБ-ВЕРСИЯ, А НЕ БОТ. Бот читает только те каналы, куда его добавили
 * администратором: чужой открытый канал так не прочитать, и просить об этом
 * некого. У Telegram есть публичная веб-версия ленты — `t.me/s/<канал>`, ровно
 * та страница, которую видит любой человек без входа. Мы читаем её как читатель:
 * ни авторизации, ни чужих прав, ни обхода ограничений площадки.
 *
 * ПОЧЕМУ ЧАСТОТА, А НЕ МОДЕЛЬ. Тема тренда должна стоить дёшево: планировщик
 * зовётся в крон-проходе, а суточная ёмкость моделей общая с автором и
 * редактором (B699). Поэтому тему выделяет счёт биграмм, а не LLM — решение
 * повторяемое и бесплатное.
 *
 * ГЛАВНОЕ ПРАВИЛО ОТБОРА: тренд считается по числу РАЗНЫХ ПОСТОВ, а не по числу
 * упоминаний. Иначе один многословный пост объявляет трендом собственную
 * лексику — тема должна повторяться у разных публикаций, это и есть признак
 * «об этом говорят».
 */

import {
  EDGE_RELAY_UPSTREAMS,
  edgeRelayAuthHeaders,
  edgeRelayBase,
} from "@/lib/integrations/edge-relay";
import { marketingPlatformValue } from "@/lib/marketing/platform-settings";
import type { TrendCandidate } from "@/lib/marketing/trend-scan";

/** Настройка со списком каналов: через запятую или с новой строки. */
export const TELEGRAM_TREND_CHANNELS_KEY = "MARKETING_TREND_TELEGRAM_CHANNELS";

/** В скольких РАЗНЫХ постах должна встретиться тема, чтобы считаться живой. */
export const TELEGRAM_TREND_MIN_POSTS = 2;
/**
 * Сколько каналов читаем за заход.
 *
 * Было 10, стало 20 (B707): владелец внёс 13 каналов, и прежний предел молча
 * отрезал три последних — список режется `slice`, а не отвергается с ошибкой.
 * Цена подъёма нулевая: каналы читаются параллельно, один канал — одна страница
 * HTML, ни одного обращения к модели.
 */
export const TELEGRAM_TREND_CHANNEL_LIMIT = 20;
/** Сколько тем отдаёт источник. */
export const TELEGRAM_TREND_TOPIC_LIMIT = 10;
/** Сколько ждём страницу канала. */
export const TELEGRAM_TREND_TIMEOUT_MS = 10_000;

/**
 * Служебные слова русского текста.
 *
 * Свой список, а не общий с `reframe.ts`: там он подобран под пересказ реплики
 * человека, здесь — под заголовок темы. Общий список пришлось бы менять сразу
 * под две задачи, и каждая правка ломала бы вторую.
 */
const STOP_WORDS = new Set([
  "который", "которая", "которые", "потому", "чтобы", "когда", "после", "перед",
  "через", "около", "может", "можно", "нужно", "надо", "если", "тоже", "также",
  "очень", "самый", "самая", "самое", "этот", "эта", "это", "эти", "того",
  "тому", "туда", "сюда", "здесь", "там", "тут", "уже", "ещё", "еще", "как",
  "так", "вот", "все", "всё", "всех", "всем", "меня", "тебя", "себя", "него",
  "неё", "нее", "них", "мне", "тебе", "нам", "вам", "они", "она", "оно", "мы",
  "вы", "он", "я", "ты", "и", "а", "но", "или", "не", "ни", "да", "же", "ли",
  "бы", "то", "за", "на", "по", "из", "от", "до", "об", "про", "для", "при",
  "над", "под", "без", "во", "со", "ко", "их", "его", "её", "ее", "наш", "ваш",
  "быть", "было", "были", "была", "будет", "есть", "стал", "стала", "стало",
  "телеграм", "подпис", "канал", "ссылк", "читать", "далее", "реклама",
]);

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;

/**
 * Короче трёх букв значимых слов не бывает, а вот трёхбуквенные в нашей теме
 * есть и они важны: «код», «сон», «муж», «дом». Порог 4 их вырезал и превращал
 * «финансовый код рождения» в «финансовый рождения».
 */
const MIN_TOKEN_LENGTH = 3;
/** Блок текста поста в веб-версии канала. */
const POST_BLOCK = /<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;

function decodeEntities(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&laquo;|&raquo;/g, "")
    .replace(/&mdash;|&ndash;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Тексты постов со страницы канала: разметка снята, ссылки выброшены. */
export function parseChannelPosts(html: string): string[] {
  const posts: string[] = [];
  for (const match of html.matchAll(POST_BLOCK)) {
    const text = decodeEntities(match[1])
      .replace(/<[^>]+>/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) posts.push(text);
  }
  return posts;
}

/** Значимые слова поста: служебные и короткие выброшены. */
function meaningfulTokens(text: string): string[] {
  return text
    .toLocaleLowerCase("ru-RU")
    .split(TOKEN_SPLIT)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token));
}

/**
 * Темы, повторяющиеся в разных постах.
 *
 * Кандидат — биграмма подряд идущих значимых слов: одно слово слишком широко
 * («отношения» — это кластер, а не тема, ровно та ошибка, что сломала первый
 * замер планировщика), три и больше почти не повторяются дословно.
 */
export function frequentTopics(posts: string[], minPosts = TELEGRAM_TREND_MIN_POSTS): Array<{ topic: string; posts: number }> {
  const postsByTopic = new Map<string, number>();
  for (const post of posts) {
    const tokens = meaningfulTokens(post);
    const seen = new Set<string>();
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      seen.add(`${tokens[index]} ${tokens[index + 1]}`);
    }
    for (const topic of seen) {
      postsByTopic.set(topic, (postsByTopic.get(topic) ?? 0) + 1);
    }
  }
  return [...postsByTopic.entries()]
    .filter(([, count]) => count >= minPosts)
    .map(([topic, posts]) => ({ topic, posts }))
    // Детерминизм: при равной частоте порядок задаёт сама тема, а не Map.
    .sort((left, right) => right.posts - left.posts || left.topic.localeCompare(right.topic));
}

function channelsFrom(value: string | null): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\/(s\/)?/, ""))
    .filter(Boolean)
    .slice(0, TELEGRAM_TREND_CHANNEL_LIMIT);
}

/** Публичный адрес ленты — тот, который открывает человек. */
export function telegramChannelPublicUrl(channel: string): string {
  return `${EDGE_RELAY_UPSTREAMS["telegram-web"]}/s/${encodeURIComponent(channel)}`;
}

/**
 * Куда и с чем идти за страницей канала.
 *
 * B707: с боевой РФ-ноды `t.me` не отвечает вовсе — блокировка та же, из-за
 * которой бот ходит через релей, а три провайдера моделей через шлюз B633.
 * Поэтому при настроенном шлюзе идём через него, а без шлюза — напрямую:
 * вне РФ прямой путь короче и работает.
 *
 * Имя канала экранируется: оно приходит из настройки, которую правит человек,
 * а склеенный руками путь с `..` увёл бы запрос на соседний маршрут шлюза.
 */
export function telegramChannelPageRequest(channel: string): {
  url: string;
  headers: Record<string, string>;
} {
  const relayBase = edgeRelayBase();
  const headers = edgeRelayAuthHeaders();
  if (!relayBase || Object.keys(headers).length === 0) {
    return { url: telegramChannelPublicUrl(channel), headers: {} };
  }
  return {
    url: `${relayBase}/telegram-web/s/${encodeURIComponent(channel)}`,
    headers,
  };
}

/**
 * Живые темы открытых каналов.
 *
 * Каналы читаются параллельно через allSettled: недоступный канал (удалён,
 * закрыт, сеть молчит) отдаёт пусто и не отменяет остальные — то же правило,
 * что у сканера трендов целиком.
 */
export async function telegramChannelTrends(input: {
  fetchImpl?: typeof fetch;
  channels?: string[];
  limit?: number;
} = {}): Promise<TrendCandidate[]> {
  const channels = input.channels ?? channelsFrom(await marketingPlatformValue(TELEGRAM_TREND_CHANNELS_KEY));
  if (channels.length === 0) return [];

  const call = input.fetchImpl ?? fetch;
  const pages = await Promise.allSettled(channels.map(async (channel) => {
    const request = telegramChannelPageRequest(channel);
    const response = await call(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(TELEGRAM_TREND_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Telegram ${channel}: HTTP ${response.status}`);
    // Ссылаемся на публичную страницу, а не на дорогу до неё: адрес шлюза —
    // наша внутренняя деталь, и в теме кандидата ему делать нечего.
    return { url: telegramChannelPublicUrl(channel), posts: parseChannelPosts(await response.text()) };
  }));

  const candidates: TrendCandidate[] = [];
  for (const page of pages) {
    if (page.status !== "fulfilled") continue;
    for (const found of frequentTopics(page.value.posts)) {
      candidates.push({
        topic: found.topic,
        rationale: `Повторяется в ${found.posts} публикациях открытого канала.`,
        source: "telegramChannels",
        referenceUrl: page.value.url,
        keywords: found.topic.split(" "),
      });
    }
  }
  return candidates.slice(0, input.limit ?? TELEGRAM_TREND_TOPIC_LIMIT);
}
