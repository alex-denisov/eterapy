import { createHash } from "crypto";
import db from "@/lib/db";
import { redditAccessToken } from "@/lib/marketing/reddit-oauth";
import { log, serializeError } from "@/lib/logger";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";
import {
  marketingPlatformEnabled,
  marketingPlatformValue,
} from "@/lib/marketing/platform-settings";
import {
  ENGAGEMENT_PLATFORMS,
  engagementDeficit,
  engagementDailyTarget,
  moscowDateKey,
  openEngagementSlots,
  type EngagementPlatform,
} from "@/lib/marketing/engagement-plan";
import { pickEngagementTone } from "@/lib/marketing/engagement-tone";

export type MarketingConnectorState = {
  platform: "VK" | "Reddit" | "Threads" | "Instagram" | "Telegram" | "Dzen";
  ownedPublishing: boolean;
  discovery: boolean;
  /** B617: ответы на ВХОДЯЩЕЕ (комментарии к своим постам, упоминания). Комментариев под чужими публикациями больше нет ни на одной площадке. */
  inboundReplies: boolean;
  missing: string[];
  note: string;
};

export async function marketingConnectorStates(): Promise<MarketingConnectorState[]> {
  const keys = [
    "VK_COMMUNITY_TOKEN", "VK_COMMUNITY_ID", "VK_USER_TOKEN", "VK_CALLBACK_SECRET", "VK_CALLBACK_CONFIRMATION",
    "REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_POST_SUBREDDIT", "REDDIT_SUBREDDITS", "REDDIT_USER_AGENT",
    "THREADS_APP_ID", "THREADS_APP_SECRET", "THREADS_ACCESS_TOKEN", "THREADS_USER_ID", "THREADS_WEBHOOK_VERIFY_TOKEN",
    "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHANNEL_ID", "TELEGRAM_DISCUSSION_CHAT_ID",
    "DZEN_CHANNEL_URL", "DZEN_BROWSER_STORAGE_STATE",
  ] as const;
  const values = new Map(await Promise.all(keys.map(async (key) => [key, await marketingPlatformValue(key)] as const)));
  const has = (name: typeof keys[number]) => Boolean(values.get(name));
  const missing = (...names: Array<typeof keys[number]>) => names.filter((key) => !has(key));
  const enabled = new Map(await Promise.all(
    (["VK", "Reddit", "Threads", "Instagram", "Telegram", "Dzen"] as const)
      .map(async (platform) => [platform, await marketingPlatformEnabled(platform)] as const),
  ));
  return [
    {
      platform: "VK",
      ownedPublishing: Boolean(enabled.get("VK")) && has("VK_COMMUNITY_TOKEN") && has("VK_COMMUNITY_ID"),
      discovery: Boolean(enabled.get("VK")) && has("VK_USER_TOKEN"),
      // B618: отвечать можно токеном сообщества, но узнать о комментарии — только
      // через подключённый Callback API. Без секрета маршрут закрыт fail-closed,
      // и «отвечаем на входящее» было бы неправдой.
      inboundReplies: Boolean(enabled.get("VK")) && has("VK_COMMUNITY_TOKEN")
        && has("VK_COMMUNITY_ID") && has("VK_CALLBACK_SECRET"),
      missing: missing("VK_COMMUNITY_TOKEN", "VK_COMMUNITY_ID", "VK_USER_TOKEN", "VK_CALLBACK_SECRET", "VK_CALLBACK_CONFIRMATION"),
      note: "Официальный VK API: токен сообщества — wall.post и ответы на входящее; отдельный пользовательский токен — newsfeed.search; Callback API сообщества приносит комментарии к нашим постам и сообщения. Права не смешиваются.",
    },
    {
      platform: "Reddit",
      ownedPublishing: Boolean(enabled.get("Reddit")) && has("REDDIT_POST_SUBREDDIT")
        && has("REDDIT_CLIENT_ID") && has("REDDIT_CLIENT_SECRET"),
      discovery: Boolean(enabled.get("Reddit")) && has("REDDIT_CLIENT_ID") && has("REDDIT_CLIENT_SECRET") && has("REDDIT_SUBREDDITS"),
      // B617 снял комментарии под чужими постами; B618 включил ответы на
      // входящее — это ящик бренд-аккаунта, официальный Data API, свой периметр.
      inboundReplies: Boolean(enabled.get("Reddit")) && has("REDDIT_CLIENT_ID") && has("REDDIT_CLIENT_SECRET"),
      missing: missing("REDDIT_POST_SUBREDDIT", "REDDIT_SUBREDDITS", "REDDIT_USER_AGENT", "REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"),
      note: "Только официальный OAuth Data API: собственные посты в свой сабреддит и ответы на входящее. Браузерная сессия убрана (B617) — вход по сохранённой сессии правила площадок называют нарушением.",
    },
    {
      platform: "Threads",
      ownedPublishing: Boolean(enabled.get("Threads")) && has("THREADS_ACCESS_TOKEN") && has("THREADS_USER_ID"),
      discovery: Boolean(enabled.get("Threads")) && has("THREADS_ACCESS_TOKEN"),
      inboundReplies: Boolean(enabled.get("Threads")) && has("THREADS_ACCESS_TOKEN")
        && has("THREADS_USER_ID") && has("THREADS_WEBHOOK_VERIFY_TOKEN"),
      missing: missing("THREADS_APP_ID", "THREADS_APP_SECRET", "THREADS_ACCESS_TOKEN", "THREADS_USER_ID", "THREADS_WEBHOOK_VERIFY_TOKEN"),
      note: "Официальный Threads API публикует посты и ответы. Поиск чужих постов идёт через официальный keyword search; без выданного разрешения он отвечает пустым списком и включается сам, когда разрешение появится.",
    },
    {
      platform: "Instagram",
      ownedPublishing: Boolean(enabled.get("Instagram")) && has("INSTAGRAM_ACCESS_TOKEN") && has("INSTAGRAM_USER_ID"),
      discovery: false,
      // B618: комментарии к своим медиа приходят webhook'ом и отвечаются
      // официальным эндпоинтом ответов. Комментировать чужие публикации этот
      // путь по-прежнему не умеет — и не должен.
      inboundReplies: Boolean(enabled.get("Instagram")) && has("INSTAGRAM_ACCESS_TOKEN")
        && has("INSTAGRAM_USER_ID") && has("INSTAGRAM_WEBHOOK_VERIFY_TOKEN"),
      missing: missing("INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN"),
      note: "Instagram API для Professional account: свои публикации и управление комментариями на своих медиа. Официальный API не даёт публиковать рекламные комментарии под произвольными чужими постами — этот путь не подменяется cookies-автоматизацией.",
    },
    {
      platform: "Telegram",
      ownedPublishing: Boolean(enabled.get("Telegram")) && has("TELEGRAM_BOT_TOKEN") && has("TELEGRAM_CHANNEL_ID"),
      discovery: false,
      // B618: у канала комментариев нет — они живут в связанной группе
      // обсуждений, поэтому без её id входящего не видно вовсе.
      inboundReplies: Boolean(enabled.get("Telegram")) && has("TELEGRAM_BOT_TOKEN")
        && has("TELEGRAM_DISCUSSION_CHAT_ID"),
      missing: missing("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHANNEL_ID", "TELEGRAM_DISCUSSION_CHAT_ID"),
      note: "Bot API публикует в собственный канал и отвечает в связанной группе обсуждений; массового поиска и комментариев к чужим каналам нет.",
    },
    {
      platform: "Dzen",
      ownedPublishing: Boolean(enabled.get("Dzen")) && has("DZEN_CHANNEL_URL") && has("DZEN_BROWSER_STORAGE_STATE"),
      discovery: false,
      inboundReplies: false,
      missing: missing("DZEN_CHANNEL_URL", "DZEN_BROWSER_STORAGE_STATE"),
      note: "У Дзена нет поддерживаемого серверного API публикации. Выпуск выполняется из изолированной авторизованной Playwright-сессии; истёкшая сессия или CAPTCHA переводит коннектор в требующий участия человека, без обхода защиты.",
    },
  ];
}

type Candidate = {
  platform: EngagementPlatform;
  targetId: string;
  targetUrl: string;
  targetLabel: string;
  excerpt: string;
  topic: string;
};

/**
 * Discovery vocabulary. Wider than the content plan on purpose: a person
 * scrolling a feed reacts to how a problem is phrased, not to a keyword list.
 */
const TOPICS = [
  "как пережить расставание",
  "не могу забыть бывшего",
  "вернётся ли бывший",
  "стоит ли увольняться",
  "выгорание",
  "мне одиноко",
  "не могу принять решение",
  "будем ли мы вместе",
  "не могу найти себя",
  "к чему снится",
  "повторяющийся сон",
  "значение карты таро",
  "матрица судьбы",
  "совместимость по дате рождения",
] as const;

export function normalizePublicPostExcerpt(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_200);
}

function matchingTopic(value: string) {
  const text = value.toLocaleLowerCase("ru-RU");
  return TOPICS.find((topic) => text.includes(topic)) ?? null;
}

async function discoverReddit(): Promise<Candidate[]> {
  const token = await redditAccessToken().catch(() => null);
  const subreddits = (await marketingPlatformValue("REDDIT_SUBREDDITS"))?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  if (!token || subreddits.length === 0) return [];
  const result: Candidate[] = [];
  for (const subreddit of subreddits.slice(0, 10)) {
    const response = await fetch(`https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/new?limit=25`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": await marketingPlatformValue("REDDIT_USER_AGENT") || "ETerapySMM/1.0",
      },
    });
    if (!response.ok) throw new Error(`Reddit discovery HTTP ${response.status}`);
    const payload = await response.json() as {
      data?: { children?: Array<{ data?: { name?: string; permalink?: string; title?: string; selftext?: string } }> };
    };
    for (const child of payload.data?.children ?? []) {
      const post = child.data;
      const combined = `${post?.title ?? ""} ${post?.selftext ?? ""}`;
      const topic = matchingTopic(combined);
      if (!post?.name || !post.permalink || !topic) continue;
      result.push({
        platform: "reddit",
        targetId: post.name,
        targetUrl: `https://www.reddit.com${post.permalink}`,
        targetLabel: `r/${subreddit}: ${normalizePublicPostExcerpt(post.title ?? "публикация")}`,
        excerpt: normalizePublicPostExcerpt(combined),
        topic,
      });
    }
  }
  return result;
}

async function discoverVk(): Promise<Candidate[]> {
  const token = await marketingPlatformValue("VK_USER_TOKEN");
  if (!token) return [];
  const result: Candidate[] = [];
  for (const topic of TOPICS) {
    const response = await fetch("https://api.vk.com/method/newsfeed.search", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: token,
        v: "5.199",
        q: topic,
        count: "10",
      }),
    });
    const payload = await response.json() as {
      response?: { items?: Array<{ owner_id?: number; id?: number; text?: string }> };
      error?: { error_msg?: string };
    };
    if (payload.error) throw new Error(`VK discovery: ${payload.error.error_msg ?? "unknown error"}`);
    for (const item of payload.response?.items ?? []) {
      // A one-line post carries no question to answer; skip it rather than
      // produce a generic reply.
      if (!item.owner_id || !item.id || (item.text ?? "").trim().length < 120) continue;
      result.push({
        platform: "vk",
        targetId: `${item.owner_id}_${item.id}`,
        targetUrl: `https://vk.com/wall${item.owner_id}_${item.id}`,
        targetLabel: `VK wall${item.owner_id}_${item.id}`,
        excerpt: normalizePublicPostExcerpt(item.text ?? ""),
        topic,
      });
    }
  }
  return result;
}

/**
 * Threads exposes an official keyword search to apps holding the
 * `threads_keyword_search` permission. Until that permission is granted the
 * call answers with an error; discovery then simply reports zero candidates
 * instead of failing the cycle, and starts working on its own once the
 * permission appears.
 */
async function discoverThreads(): Promise<Candidate[]> {
  const token = await marketingPlatformValue("THREADS_ACCESS_TOKEN");
  if (!token) return [];
  const result: Candidate[] = [];
  for (const topic of TOPICS.slice(0, 6)) {
    const url = new URL("https://graph.threads.net/v1.0/keyword_search");
    url.searchParams.set("q", topic);
    url.searchParams.set("search_type", "TOP");
    url.searchParams.set("fields", "id,text,permalink,username");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null) as {
      data?: Array<{ id?: string; text?: string; permalink?: string; username?: string }>;
      error?: { message?: string; code?: number };
    } | null;
    if (payload?.error) {
      // Missing permission is a configuration state, not an outage.
      if (/permission|scope|unsupported/i.test(payload.error.message ?? "")) return [];
      throw new Error(`Threads discovery: ${payload.error.message ?? `HTTP ${response.status}`}`);
    }
    for (const item of payload?.data ?? []) {
      if (!item.id || !item.permalink || (item.text ?? "").trim().length < 60) continue;
      result.push({
        platform: "threads",
        targetId: item.id,
        targetUrl: item.permalink,
        targetLabel: `Threads @${item.username ?? "unknown"}`,
        excerpt: normalizePublicPostExcerpt(item.text ?? ""),
        topic,
      });
    }
  }
  return result;
}

function engagementKey(candidate: Pick<Candidate, "platform" | "targetId">) {
  const digest = createHash("sha256")
    .update(`${candidate.platform}:${candidate.targetId}`)
    .digest("hex")
    .slice(0, 24);
  // B617: ключ остался прежним, чтобы уже заведённые строки обновлялись, а не
  // задваивались, но смысл другой — это тема, а не адрес чужого поста.
  return `smm-topic-${digest}`;
}

/**
 * B617: наблюдение публичного поста порождает НАШУ публикацию на ту же тему, а
 * не ответ его автору. Чтение публичных данных официальным API законно везде;
 * плановый комментарий под чужим постом — нет. Охват собственного поста на
 * горячую тему к тому же выше, чем реплики в чужой ветке.
 *
 * Адрес и идентификатор исходного поста намеренно НЕ сохраняются: пока их нет
 * в строке, ни один исполнитель не сможет отправить туда ответ даже по ошибке.
 */
export async function ingestEngagementCandidate(
  candidate: Candidate,
  placement: { scheduledFor: Date; toneId: string },
) {
  const key = engagementKey(candidate);
  return db.externalPublication.upsert({
    where: { key },
    create: {
      key,
      platform: candidate.platform,
      title: `Тема дня: ${candidate.topic}`,
      contentType: "POST",
      status: "DRAFT",
      cluster: candidate.topic,
      targetQuery: candidate.topic,
      body: null,
      source: "AGENT_DISCOVERY",
      // Выдержка остаётся как свидетельство живого спроса на тему — из неё
      // пишется свой материал, цитировать и адресовать её нельзя.
      engagementExcerpt: candidate.excerpt,
      engagementTone: placement.toneId,
      scheduledFor: placement.scheduledFor,
      autoPublish: false,
    },
    update: {
      engagementExcerpt: candidate.excerpt,
    },
  });
}

const DISCOVERERS: Record<EngagementPlatform, () => Promise<Candidate[]>> = {
  reddit: discoverReddit,
  vk: discoverVk,
  threads: discoverThreads,
};

/**
 * Today's already-planned replies for one platform, used both to avoid
 * double-booking a slot and to keep the register rotating.
 */
async function plannedToday(platform: EngagementPlatform, now: Date) {
  const dayStart = new Date(`${moscowDateKey(now)}T00:00:00.000+03:00`);
  const dayEnd = new Date(dayStart.getTime() + 30 * 60 * 60_000);
  const rows = await db.externalPublication.findMany({
    where: {
      platform,
      // B617: discovery больше не заводит COMMENT — только собственные посты по
      // найденной теме. Старые COMMENT-строки в выборку не попадают, они уходят
      // в архив отдельным проходом.
      contentType: "POST",
      source: "AGENT_DISCOVERY",
      status: { notIn: ["ARCHIVED"] },
      scheduledFor: { gte: dayStart, lt: dayEnd },
    },
    select: { scheduledFor: true, engagementTone: true, key: true },
    orderBy: { scheduledFor: "desc" },
  });
  return {
    slots: rows.map((row) => row.scheduledFor).filter((value): value is Date => Boolean(value)),
    toneIds: rows.map((row) => row.engagementTone).filter((value): value is string => Boolean(value)),
    // Ключ темы детерминирован по исходному посту, поэтому по нему же
    // отсеиваются повторы — без хранения адреса чужой публикации.
    takenKeys: new Set(rows.map((row) => row.key)),
  };
}

export interface EngagementDiscoveryOutcome {
  platform: EngagementPlatform;
  target: number;
  planned: number;
  found: number;
  ingested: number;
  error?: string;
}

/**
 * Keeps every comment-capable network stocked with the day's quota of replies.
 * Each ingested candidate lands on its own human-paced slot with its own
 * register, and still goes through the writer/editor loop and Telegram
 * premoderation before anything reaches the platform.
 */
export async function runEngagementDiscovery(
  input: { now?: Date } = {},
): Promise<EngagementDiscoveryOutcome[]> {
  const now = input.now ?? new Date();
  const outcomes: EngagementDiscoveryOutcome[] = [];

  for (const platform of ENGAGEMENT_PLATFORMS) {
    const existing = await plannedToday(platform, now).catch(() => ({
      slots: [] as Date[],
      toneIds: [] as string[],
      takenKeys: new Set<string>(),
    }));
    const target = engagementDailyTarget(platform, now);
    const wanted = engagementDeficit({ platform, now, existingToday: existing.slots });
    if (wanted === 0) {
      outcomes.push({
        platform,
        target,
        planned: existing.slots.length,
        found: 0,
        ingested: 0,
      });
      continue;
    }

    try {
      const candidates = (await DISCOVERERS[platform]())
        .filter((candidate) => !existing.takenKeys.has(engagementKey(candidate)));
      const slots = openEngagementSlots({ platform, now, taken: existing.slots }).slice(0, wanted);
      const recentTones = [...existing.toneIds];
      let ingested = 0;
      for (const [index, slot] of slots.entries()) {
        const candidate = candidates[index];
        if (!candidate) break;
        const tone = pickEngagementTone({
          platform,
          sequence: existing.slots.length + index,
          recentToneIds: recentTones,
        });
        await ingestEngagementCandidate(candidate, { scheduledFor: slot, toneId: tone.id });
        recentTones.unshift(tone.id);
        ingested += 1;
      }
      await resolveMarketingSignal(`discovery:${platform}`).catch(() => undefined);
      outcomes.push({
        platform,
        target,
        planned: existing.slots.length + ingested,
        found: candidates.length,
        ingested,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await upsertMarketingSignal({
        key: `discovery:${platform}`,
        kind: "CONNECTOR",
        severity: "WARNING",
        title: `Не работает поиск кандидатов: ${platform}`,
        summary: message,
        evidence: { platform },
      }).catch(() => undefined);
      log.error("marketing-discovery.failed", { platform, error: serializeError(error) });
      outcomes.push({
        platform,
        target,
        planned: existing.slots.length,
        found: 0,
        ingested: 0,
        error: message,
      });
    }
  }

  return outcomes;
}
