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
/** Сколько публикаций опрашивать за один обход — свежие важнее старых. */
export const SWEEP_PUBLICATION_LIMIT = 20;
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
}

interface SweepTarget {
  id: string;
  externalPostId: string;
  publicUrl: string | null;
}

async function publishedTargets(platform: SweepPlatform, now: Date): Promise<SweepTarget[]> {
  const rows = await db.externalPublication.findMany({
    where: {
      platform,
      status: "PUBLISHED",
      externalPostId: { not: null },
      publishedAt: { gte: new Date(now.getTime() - SWEEP_LOOKBACK_MS) },
    },
    orderBy: { publishedAt: "desc" },
    take: SWEEP_PUBLICATION_LIMIT,
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

async function sweepThreads(target: SweepTarget): Promise<SweptComment[]> {
  const token = await marketingPlatformValue("THREADS_ACCESS_TOKEN");
  const userId = await marketingPlatformValue("THREADS_USER_ID");
  if (!token) return [];
  const url = `${metaEndpoint("threads")}/v1.0/${encodeURIComponent(target.externalPostId)}/replies`
    + `?fields=id,text,username,permalink,timestamp,from`
    + `&access_token=${encodeURIComponent(token)}`;
  const payload = await metaJson(url);
  const items = (payload.data as Array<{
    id?: string;
    text?: string;
    username?: string;
    permalink?: string;
    timestamp?: string;
    from?: { id?: string };
  }> | undefined) ?? [];
  return items.flatMap((item) => {
    if (!item.id || !(item.text ?? "").trim()) return [];
    return [{
      externalId: item.id,
      authorLabel: item.username ? `@${item.username}` : null,
      text: item.text ?? "",
      permalink: item.permalink ?? target.publicUrl,
      createdAt: item.timestamp ? new Date(item.timestamp) : null,
      own: Boolean(userId && item.from?.id === userId),
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
 * Один обход. Возвращает по площадке: сколько публикаций опрошено, сколько
 * комментариев увидено и сколько попало в очередь. Ноль найденных и отказ
 * площадки — разные строки, и это намеренно: молчание, неотличимое от «нет
 * комментариев», уже однажды стоило нам полутора недель.
 */
export async function sweepOwnPublicationComments(
  input: { now?: Date; platforms?: readonly SweepPlatform[] } = {},
): Promise<SweepOutcome[]> {
  const now = input.now ?? new Date();
  const outcomes: SweepOutcome[] = [];

  for (const platform of input.platforms ?? SWEEP_PLATFORMS) {
    if (!await marketingPlatformEnabled(CONNECTOR_BY_PLATFORM[platform]).catch(() => false)) {
      outcomes.push({ platform, publications: 0, found: 0, ingested: 0, skippedOwn: 0 });
      continue;
    }
    try {
      const targets = await publishedTargets(platform, now);
      let found = 0;
      let ingested = 0;
      let skippedOwn = 0;
      for (const target of targets) {
        const comments = await SWEEPERS[platform](target);
        for (const comment of comments) {
          found += 1;
          if (comment.own) {
            skippedOwn += 1;
            continue;
          }
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
      await resolveMarketingSignal(`sweep:${platform}`).catch(() => undefined);
      outcomes.push({ platform, publications: targets.length, found, ingested, skippedOwn });
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
