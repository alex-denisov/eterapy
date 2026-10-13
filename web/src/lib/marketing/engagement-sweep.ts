/**
 * B630 — обход комментариев под нашими публикациями.
 *
 * До этого комментарий попадал к нам ровно одним путём — webhook площадки. Это
 * значит, что канал видел комментарии только там, где владелец успел настроить
 * обратный вызов, а у Meta он не подтверждается в принципе (B631: проверка
 * приходит на российский IP и отваливается по таймауту). Снаружи это выглядит
 * как «агент не отвечает», хотя агент попросту ничего не получал.
 *
 * Обход снимает эту зависимость: раз в 15 минут мы сами спрашиваем площадку,
 * что появилось под НАШИМИ публикациями за последние две недели. Webhook при
 * этом остаётся — он быстрее; дубль отсекает уникальная пара
 * (`platform`, `externalId`) в базе, поэтому два пути не мешают друг другу.
 *
 * Обход касается только собственных публикаций: чужие ленты здесь не читаются
 * (законный периметр B617).
 */

import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";
import { ingestInboundMessage } from "@/lib/marketing/inbound";
import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";
import {
  marketingPlatformEnabled,
  marketingPlatformValue,
} from "@/lib/marketing/platform-settings";

/** Ветка старше двух недель живой не бывает: там уже никто не ждёт ответа. */
export const SWEEP_LOOKBACK_MS = 14 * 24 * 60 * 60_000;
/** Сколько публикаций опрашивать за один быстрый обход — свежие важнее старых. */
export const SWEEP_PUBLICATION_LIMIT = 20;
/** B777: полный обход (14 суток) берёт больше: при 4–8 постах в сутки двадцати хватало на 2–5 суток. */
export const SWEEP_FULL_PUBLICATION_LIMIT = 60;
/** Окно «быстрого» обхода: больше него — полный. */
const FAST_SWEEP_LOOKBACK_MS = 48 * 60 * 60_000;
/** Ответы моложе этого срока сторож сверяет с базой: ответ есть у площадки, а у нас ни одного входящего. */
export const INBOUND_GAP_WINDOW_MS = 24 * 60 * 60_000;
/** Пост, которого у площадки нет (удалён или недоступен), не опрашиваем снова столько времени. */
export const GONE_TARGET_TTL_MS = 12 * 60 * 60_000;
const VK_API_VERSION = "5.199";

export type SweepPlatform = "vk" | "threads" | "instagram";
export const SWEEP_PLATFORMS: readonly SweepPlatform[] = ["vk", "threads", "instagram"];

const CONNECTOR_BY_PLATFORM = {
  vk: "VK",
  threads: "Threads",
  instagram: "Instagram",
} as const;

export interface SweptComment {
  externalId: string;
  /** Ветка у площадки: для VK — `<owner>_<post>`, как у Callback API. */
  threadId?: string | null;
  authorLabel: string | null;
  text: string;
  permalink: string | null;
  createdAt?: Date | null;
  /** Комментарий бренд-аккаунта: наш собственный ответ, отвечать на него нельзя. */
  own: boolean;
}

export interface SweepOutcome {
  platform: SweepPlatform;
  publications: number;
  found: number;
  ingested: number;
  skippedOwn: number;
  error?: string;
  /** B690: площадка доставляет комментарии push’ем — опрос не выполнялся. */
  deliveredByPush?: boolean;
  /** B777: постов, которые площадка не отдала по ошибке (не считая удалённых). */
  failedTargets?: number;
  /** B777: постов, которых у площадки больше нет (удалены): пропущены. */
  goneTargets?: number;
}

interface SweepTarget {
  id: string;
  externalPostId: string;
  publicUrl: string | null;
}

async function publishedTargets(
  platform: SweepPlatform,
  now: Date,
  lookbackMs: number = SWEEP_LOOKBACK_MS,
): Promise<SweepTarget[]> {
  const rows = await db.externalPublication.findMany({
    where: {
      platform,
      status: "PUBLISHED",
      externalPostId: { not: null },
      publishedAt: { gte: new Date(now.getTime() - lookbackMs) },
    },
    orderBy: { publishedAt: "desc" },
    take: lookbackMs > FAST_SWEEP_LOOKBACK_MS ? SWEEP_FULL_PUBLICATION_LIMIT : SWEEP_PUBLICATION_LIMIT,
    select: { id: true, externalPostId: true, publicUrl: true },
  });
  return rows.flatMap((row) => (row.externalPostId
    ? [{ id: row.id, externalPostId: row.externalPostId, publicUrl: row.publicUrl }]
    : []));
}

/**
 * ⚠ B677, живая проба 2026-08-05: прежняя запись здесь была НЕВЕРНА. VK отвечает
 * на `wall.getComments` токеном сообщества так:
 *
 *   «Group authorization failed: method is unavailable with group auth»
 *
 * То есть чтение комментариев к собственной стене токену сообщества недоступно —
 * ровно как загрузка фото через стеновое хранилище в B660. Это ограничение на
 * стороне VK, а не наша ошибка настройки, и повторные попытки его не снимут.
 *
 * Рабочий путь (не сделан, отдельная работа): Bots Long Poll сообщества —
 * `groups.setLongPollSettings` + событие `wall_reply_new`, оба доступны тому же
 * токену сообщества. Пока его нет, обход VK возвращает пусто и говорит об этом
 * ОДИН раз уровнем INFO, а не поднимает предупреждение каждый час.
 */
const VK_GROUP_AUTH_LIMIT = /unavailable with group auth|group authorization failed/i;

/** Ошибка, причина которой — правила площадки, а не наш сбой. */
type PlatformLimitedError = Error & { platformLimited?: boolean };
async function sweepVk(target: SweepTarget): Promise<SweptComment[]> {
  const token = await marketingPlatformValue("VK_COMMUNITY_TOKEN");
  const communityId = (await marketingPlatformValue("VK_COMMUNITY_ID"))?.replace(/^-/, "");
  if (!token || !communityId) return [];
  const response = await fetch("https://api.vk.com/method/wall.getComments", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      owner_id: `-${communityId}`,
      post_id: target.externalPostId,
      count: "50",
      sort: "desc",
      thread_items_count: "10",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as {
    response?: {
      items?: Array<{
        id?: number;
        from_id?: number;
        text?: string;
        date?: number;
        thread?: { items?: Array<{ id?: number; from_id?: number; text?: string; date?: number }> };
      }>;
    };
    error?: { error_msg?: string };
  } | null;
  if (payload?.error) {
    const message = payload.error.error_msg ?? "unknown error";
    // Известное ограничение площадки — не сбой обхода. Молча вернуть пусто
    // было бы хуже: причина исчезла бы вовсе. Поэтому одна строка INFO.
    const error = new Error(`VK comments: ${message}`);
    // Ограничение площадки помечается на самой ошибке: обработчик наверху
    // один на все площадки, и различать причины по тексту в нём — расползание.
    if (VK_GROUP_AUTH_LIMIT.test(message)) {
      (error as PlatformLimitedError).platformLimited = true;
    }
    throw error;
  }

  const community = Number(communityId);
  const flat = (payload?.response?.items ?? []).flatMap((item) => [
    item,
    ...(item.thread?.items ?? []),
  ]);
  return flat.flatMap((item) => {
    if (!item.id || !(item.text ?? "").trim()) return [];
    return [{
      // Тот же вид идентификатора, что у Callback API (`String(object.id)`):
      // иначе один комментарий пришёл бы дважды — webhook'ом и обходом — и
      // дедупликация по паре (площадка, идентификатор) их бы не связала.
      externalId: String(item.id),
      threadId: `-${community}_${target.externalPostId}`,
      authorLabel: item.from_id ? `VK id${item.from_id}` : null,
      text: item.text ?? "",
      permalink: `https://vk.com/wall-${community}_${target.externalPostId}?reply=${item.id}`,
      createdAt: item.date ? new Date(item.date * 1_000) : null,
      // Отрицательный `from_id` — это сообщество, то есть мы сами.
      own: (item.from_id ?? 0) === -community,
    }];
  });
}

/**
 * B777: пост, которого у площадки больше нет. Один такой пост (владелец удалил
 * его руками) валил весь обход Threads с 12.10: ошибка первой же цели обрывала
 * цикл, и ни один ответ под остальными постами не читался.
 */
export function isGoneTargetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not exist|cannot be loaded due to missing permissions|unsupported get request/i.test(message);
}

/** Удалённые у площадки цели: id публикации → когда увидели. Память процесса: после рестарта проверим снова. */
const goneTargets = new Map<string, number>();

/** Для тестов. */
export function resetGoneTargets(): void {
  goneTargets.clear();
}

async function metaJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: metaRequestHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) throw new Error(`HTTP ${response.status}`);
  const error = payload.error as { message?: string } | undefined;
  if (error) throw new Error(error.message ?? `HTTP ${response.status}`);
  return payload;
}

let ownThreadsUsername: { token: string; value: string; at: number } | null = null;

/** `from.id` в ответах Threads не приходит — свои комментарии узнаём по имени аккаунта. */
async function threadsOwnUsername(token: string): Promise<string | null> {
  // Кеш привязан к токену: смена аккаунта в настройках не должна тянуть старое имя.
  if (ownThreadsUsername?.token === token && Date.now() - ownThreadsUsername.at < 60 * 60_000) {
    return ownThreadsUsername.value;
  }
  try {
    const payload = await metaJson(
      `${metaEndpoint("threads")}/v1.0/me?fields=username&access_token=${encodeURIComponent(token)}`,
    );
    const name = typeof payload.username === "string" ? payload.username.toLowerCase() : null;
    if (name) ownThreadsUsername = { token, value: name, at: Date.now() };
    return name;
  } catch {
    return null;
  }
}

interface ThreadsReplyItem {
  id?: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  from?: { id?: string };
}

const THREADS_REPLY_FIELDS = "id,text,username,permalink,timestamp,from";

/**
 * B777: `/conversation` отдаёт ВСЕ ответы ветки, в том числе ответы на ответы и
 * на части нашего же продолжения; `/replies` — только прямые. Если `/conversation`
 * не отвечает, берём прямые ответы, чем остаться без обоих.
 */
async function threadsReplyItems(postId: string, token: string): Promise<ThreadsReplyItem[]> {
  const base = `${metaEndpoint("threads")}/v1.0/${encodeURIComponent(postId)}`;
  const query = `?fields=${THREADS_REPLY_FIELDS}&access_token=${encodeURIComponent(token)}`;
  try {
    const payload = await metaJson(`${base}/conversation${query}`);
    return (payload.data as ThreadsReplyItem[] | undefined) ?? [];
  } catch (conversationError) {
    if (isGoneTargetError(conversationError)) throw conversationError;
    const payload = await metaJson(`${base}/replies${query}`);
    return (payload.data as ThreadsReplyItem[] | undefined) ?? [];
  }
}

async function sweepThreads(target: SweepTarget): Promise<SweptComment[]> {
  const token = await marketingPlatformValue("THREADS_ACCESS_TOKEN");
  const userId = await marketingPlatformValue("THREADS_USER_ID");
  if (!token) return [];
  const ownName = await threadsOwnUsername(token);
  const items = await threadsReplyItems(target.externalPostId, token);
  return items.flatMap((item) => {
    if (!item.id || !(item.text ?? "").trim()) return [];
    return [{
      externalId: item.id,
      authorLabel: item.username ? `@${item.username}` : null,
      text: item.text ?? "",
      permalink: item.permalink ?? target.publicUrl,
      createdAt: item.timestamp ? new Date(item.timestamp) : null,
      own: Boolean(
        (userId && item.from?.id === userId)
        || (ownName && item.username?.toLowerCase() === ownName),
      ),
    }];
  });
}

async function sweepInstagram(target: SweepTarget): Promise<SweptComment[]> {
  const token = await marketingPlatformValue("INSTAGRAM_ACCESS_TOKEN");
  const userId = await marketingPlatformValue("INSTAGRAM_USER_ID");
  if (!token) return [];
  const url = `${metaEndpoint("instagram")}/v25.0/${encodeURIComponent(target.externalPostId)}/comments`
    + `?fields=id,text,username,timestamp,from`
    + `&access_token=${encodeURIComponent(token)}`;
  const payload = await metaJson(url);
  const items = (payload.data as Array<{
    id?: string;
    text?: string;
    username?: string;
    timestamp?: string;
    from?: { id?: string };
  }> | undefined) ?? [];
  return items.flatMap((item) => {
    if (!item.id || !(item.text ?? "").trim()) return [];
    return [{
      externalId: item.id,
      authorLabel: item.username ? `@${item.username}` : null,
      text: item.text ?? "",
      permalink: target.publicUrl,
      createdAt: item.timestamp ? new Date(item.timestamp) : null,
      own: Boolean(userId && item.from?.id === userId),
    }];
  });
}

const SWEEPERS: Record<SweepPlatform, (target: SweepTarget) => Promise<SweptComment[]>> = {
  vk: sweepVk,
  threads: sweepThreads,
  instagram: sweepInstagram,
};

/**
 * B690 — комментарии VK приходят сами, если подключён Callback API сообщества.
 *
 * `wall.getComments` токену сообщества недоступен в принципе, поэтому обход VK
 * не мог закончиться ничем, кроме отказа, и сигнал `sweep:vk` не мог погаснуть.
 * Но работающий путь у нас уже есть и он не опрос: VK шлёт `wall_reply_new` на
 * `/api/integrations/vk/callback`, и маршрут этот fail-closed — без секрета он
 * не принимает ничего. Значит наличие секрета и есть признак «push настроен».
 *
 * Обход отключается ТОЛЬКО при настроенном push. Снимут секрет — тишина снова
 * станет подозрительной, обход вернётся вместе со своим сигналом: менять
 * шумный отказ на молчаливый нельзя.
 */
export function vkCommentsArriveByPush(input: {
  callbackSecret?: string | null;
  confirmation?: string | null;
}): boolean {
  return Boolean(input.callbackSecret?.trim());
}

/**
 * B777 — СТОРОЖ РАЗРЫВА: у площадки под нашими постами за сутки есть чужие
 * ответы, а в нашей базе за те же сутки ни одного входящего. Так выглядело
 * молчание с 12.10: журнал чист, сигнала нет, потому что ничего не падало
 * громко. Сигнал — в служебный канал, снимается, когда входящие снова идут.
 */
async function auditInboundGap(platform: SweepPlatform, now: Date, recentReplies: number): Promise<void> {
  const key = `inbound-gap:${platform}`;
  if (recentReplies === 0) {
    await resolveMarketingSignal(key).catch(() => undefined);
    return;
  }
  const stored = await db.marketingInboundMessage.count({
    where: { platform, receivedAt: { gte: new Date(now.getTime() - INBOUND_GAP_WINDOW_MS) } },
  });
  if (stored > 0) {
    await resolveMarketingSignal(key).catch(() => undefined);
    return;
  }
  await upsertMarketingSignal({
    key,
    kind: "INBOUND",
    severity: "WARNING",
    title: `${platform}: ответы под нашими постами есть, входящих в базе нет`,
    summary: `Площадка отдаёт ${recentReplies} чужих ответов за сутки, а в marketing_inbound_messages за те же сутки пусто. `
      + "Приём ответов не работает: смотреть журнал обхода и подписку webhook на поле replies.",
    evidence: { platform, recentReplies, windowHours: INBOUND_GAP_WINDOW_MS / 3_600_000 },
  }).catch(() => undefined);
}

/**
 * Один обход. Возвращает по площадке: сколько публикаций опрошено, сколько
 * комментариев увидено и сколько попало в очередь. Ноль найденных и отказ
 * площадки — разные строки, и это намеренно: молчание, неотличимое от «нет
 * комментариев», уже однажды стоило нам полутора недель.
 */
export async function sweepOwnPublicationComments(
  input: { now?: Date; platforms?: readonly SweepPlatform[]; lookbackMs?: number } = {},
): Promise<SweepOutcome[]> {
  const now = input.now ?? new Date();
  const outcomes: SweepOutcome[] = [];

  for (const platform of input.platforms ?? SWEEP_PLATFORMS) {
    if (!await marketingPlatformEnabled(CONNECTOR_BY_PLATFORM[platform]).catch(() => false)) {
      outcomes.push({ platform, publications: 0, found: 0, ingested: 0, skippedOwn: 0 });
      continue;
    }
    // B690: у VK комментарии доставляет Callback API. Опрашивать площадку
    // методом, который ей недоступен, значит каждую минуту поднимать сигнал о
    // проблеме, которой нет.
    if (platform === "vk" && vkCommentsArriveByPush({
      callbackSecret: await marketingPlatformValue("VK_CALLBACK_SECRET").catch(() => null),
    })) {
      await resolveMarketingSignal(`sweep:${platform}`).catch(() => undefined);
      outcomes.push({ platform, publications: 0, found: 0, ingested: 0, skippedOwn: 0, deliveredByPush: true });
      continue;
    }
    try {
      const targets = await publishedTargets(platform, now, input.lookbackMs);
      let found = 0;
      let ingested = 0;
      let skippedOwn = 0;
      let failedTargets = 0;
      let goneCount = 0;
      let recentReplies = 0;
      let succeeded = 0;
      let firstError: unknown = null;
      for (const target of targets) {
        const goneAt = goneTargets.get(target.id);
        if (goneAt !== undefined && now.getTime() - goneAt < GONE_TARGET_TTL_MS) {
          goneCount += 1;
          continue;
        }
        let comments: SweptComment[];
        try {
          comments = await SWEEPERS[platform](target);
          succeeded += 1;
        } catch (error) {
          // Платформенное ограничение (VK) и общий сбой (токен, сеть) — вопрос всего
          // обхода: пусть его увидит обработчик ниже. Сбой одной цели им не является.
          if ((error as PlatformLimitedError).platformLimited) throw error;
          if (isGoneTargetError(error)) {
            goneTargets.set(target.id, now.getTime());
            goneCount += 1;
            log.info("marketing-sweep.target_gone", { platform, publicationId: target.id });
          } else {
            failedTargets += 1;
            firstError ??= error;
            log.warn("marketing-sweep.target_failed", { platform, publicationId: target.id, error: serializeError(error) });
          }
          continue;
        }
        for (const comment of comments) {
          found += 1;
          if (comment.own) {
            skippedOwn += 1;
            continue;
          }
          if (comment.createdAt && now.getTime() - comment.createdAt.getTime() < INBOUND_GAP_WINDOW_MS) recentReplies += 1;
          const result = await ingestInboundMessage({
            platform,
            kind: "COMMENT",
            externalId: comment.externalId,
            threadId: comment.threadId ?? target.externalPostId,
            authorLabel: comment.authorLabel,
            text: comment.text,
            permalink: comment.permalink,
            receivedAt: comment.createdAt ?? undefined,
          });
          if (result?.created) ingested += 1;
        }
      }
      // Ни одна цель не прочиталась из-за настоящих ошибок (токен, сеть) — это сбой обхода.
      if (failedTargets > 0 && succeeded === 0) throw firstError;
      // Все посты «удалены» разом — это не удаления, а чужой токен или права: сбой, а не тишина.
      if (targets.length >= 3 && goneCount === targets.length) {
        throw new Error("Все опрошенные посты недоступны (токен другого аккаунта или нет прав)");
      }
      await auditInboundGap(platform, now, recentReplies).catch(() => undefined);
      await resolveMarketingSignal(`sweep:${platform}`).catch(() => undefined);
      outcomes.push({
        platform, publications: targets.length, found, ingested, skippedOwn,
        ...(failedTargets > 0 ? { failedTargets } : {}),
        ...(goneCount > 0 ? { goneTargets: goneCount } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // B677: «площадка так не умеет» и «обход упал» — разные вещи. Первое не
      // чинится повторами и не должно неделями висеть предупреждением рядом с
      // настоящими сбоями; второе — должно.
      const limited = Boolean((error as PlatformLimitedError | undefined)?.platformLimited);
      await upsertMarketingSignal({
        key: `sweep:${platform}`,
        kind: "INBOUND",
        severity: limited ? "INFO" : "WARNING",
        title: limited
          ? `${platform}: комментарии недоступны нашему токену`
          : `Обход комментариев не прошёл: ${platform}`,
        summary: limited
          ? `${message}. Это ограничение площадки, а не настройка: повторные попытки его не снимут. `
            + "Рабочий путь для VK — Bots Long Poll сообщества (groups.setLongPollSettings + wall_reply_new), "
            + "он доступен тому же токену сообщества и пока не реализован."
          : message,
        evidence: { platform, platformLimited: limited },
      }).catch(() => undefined);
      log.error("marketing-sweep.failed", { platform, error: serializeError(error) });
      outcomes.push({ platform, publications: 0, found: 0, ingested: 0, skippedOwn: 0, error: message });
    }
  }
  return outcomes;
}
