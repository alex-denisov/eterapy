/**
 * B618 — контур входящего.
 *
 * После B617 плановые комментарии под чужими постами сняты; входящее — то, что
 * остаётся, и канал при этом сильнее: ответ подписчику читает вся ветка, а не
 * один автор чужого поста.
 *
 * Один вход (`ingestInboundMessage`), одна очередь, одна машина состояний:
 *
 *   RECEIVED → DRAFTED → ANSWERED
 *            ↘ ESCALATED   (кризисная формулировка — только человек)
 *            ↘ IGNORED     (адресовано не нам)
 *
 * Дедупликация обеспечена базой дважды: пара (platform, externalId) уникальна,
 * поэтому повторная доставка webhook не создаёт второе входящее, а уникальный
 * `ExternalPublication.inboundReplyToId` не даёт завести на одно входящее два
 * ответа. INC-094 научил, что состояние без исполнителя живёт вечно молча, —
 * поэтому у очереди есть сторож (`auditUnansweredInbound`).
 */

import { createHash } from "node:crypto";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { HARM_ELEVATED_THRESHOLD, scoreHarmRisk } from "@/lib/dialogue-safety";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";
import { pickInboundTone } from "@/lib/marketing/engagement-tone";
import { INBOUND_REPLY_CONTENT_TYPE } from "@/lib/marketing/perimeter";
import {
  marketingPlatformEnabled,
  marketingPlatformValue,
} from "@/lib/marketing/platform-settings";
import { redditAccessToken } from "@/lib/marketing/reddit-oauth";
import { resolveOpsChannel } from "@/lib/ops-notification-channel";
import { sendTelegram } from "@/lib/telegram";

export const INBOUND_PLATFORMS = ["vk", "threads", "instagram", "telegram", "reddit"] as const;
export type InboundPlatform = typeof INBOUND_PLATFORMS[number];

export const INBOUND_KINDS = ["COMMENT", "MENTION", "DIRECT"] as const;
export type InboundKind = typeof INBOUND_KINDS[number];

export const INBOUND_STATUSES = ["RECEIVED", "DRAFTED", "ANSWERED", "ESCALATED", "IGNORED"] as const;

/** Сколько входящее может ждать реакции, прежде чем это станет сигналом. */
export const INBOUND_STALE_MS = 24 * 60 * 60_000;
const STALE_NOTIFY_INTERVAL_MS = 6 * 60 * 60_000;
const STALE_NOTIFY_SETTING_KEY = "marketing.inbound.stalled.notifiedAt";

export function isInboundPlatform(value: string): value is InboundPlatform {
  return (INBOUND_PLATFORMS as readonly string[]).includes(value.toLowerCase());
}

export function normalizeInboundText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1_200);
}

export interface IngestInboundInput {
  platform: InboundPlatform;
  kind: InboundKind;
  /** Идентификатор входящего у площадки. Основа дедупликации. */
  externalId: string;
  /** Наш пост, медиа или чат, внутри которого пришло входящее. */
  threadId?: string | null;
  authorLabel?: string | null;
  text: string;
  permalink?: string | null;
  receivedAt?: Date;
}

export interface IngestInboundResult {
  id: string;
  created: boolean;
  status: string;
}

/**
 * Единственная дверь внутрь очереди. Повторная доставка обновляет текст (площадка
 * могла прислать отредактированную версию) и НЕ трогает статус: иначе уже
 * отвеченное входящее вернулось бы в работу и получило второй ответ.
 */
export async function ingestInboundMessage(
  input: IngestInboundInput,
): Promise<IngestInboundResult | null> {
  const text = normalizeInboundText(input.text);
  const externalId = input.externalId.trim();
  if (!externalId || !text) return null;

  const existing = await db.marketingInboundMessage.findUnique({
    where: { platform_externalId: { platform: input.platform, externalId } },
    select: { id: true, status: true },
  });
  if (existing) {
    await db.marketingInboundMessage.update({
      where: { id: existing.id },
      data: { text, permalink: input.permalink ?? undefined },
    });
    return { id: existing.id, created: false, status: existing.status };
  }

  const created = await db.marketingInboundMessage.create({
    data: {
      platform: input.platform,
      kind: input.kind,
      externalId,
      threadId: input.threadId ?? null,
      authorLabel: input.authorLabel ?? null,
      text,
      permalink: input.permalink ?? null,
      receivedAt: input.receivedAt ?? new Date(),
      harmScore: scoreHarmRisk(text).score,
    },
    select: { id: true, status: true },
  });
  log.info("marketing-inbound.received", {
    platform: input.platform,
    kind: input.kind,
    inboundId: created.id,
  });
  return { id: created.id, created: true, status: created.status };
}

function replyKey(platform: string, externalId: string) {
  const digest = createHash("sha256").update(`${platform}:${externalId}`).digest("hex").slice(0, 24);
  return `smm-inbound-${digest}`;
}

async function notifyOps(message: string) {
  const channel = await resolveOpsChannel();
  for (const chatId of channel.chatIds) {
    await sendTelegram(chatId, message).catch((error) => {
      log.error("marketing-inbound.ops_notify_failed", { error: serializeError(error) });
    });
  }
  return channel.chatIds.length > 0;
}

function escape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export interface QueueInboundRepliesResult {
  considered: number;
  drafted: number;
  escalated: number;
}

/**
 * Готовит ответы на новые входящие. Сам ответ пишет тот же конвейер
 * writer → независимый редактор → премодерация в Telegram, что и у публикаций:
 * второго пути наружу у агента нет.
 */
export async function queueInboundReplies(input: {
  now?: Date;
  limit?: number;
} = {}): Promise<QueueInboundRepliesResult> {
  const now = input.now ?? new Date();
  const rows = await db.marketingInboundMessage.findMany({
    where: { status: "RECEIVED", reply: null },
    orderBy: { receivedAt: "asc" },
    take: input.limit ?? 10,
  });

  let drafted = 0;
  let escalated = 0;
  for (const [index, row] of rows.entries()) {
    // Кризисная формулировка не отвечается регистром «сухая ирония» и вообще не
    // отвечается автоматом: она уходит человеку, как и в продукте.
    const harm = scoreHarmRisk(row.text);
    if (harm.score >= HARM_ELEVATED_THRESHOLD) {
      await db.marketingInboundMessage.update({
        where: { id: row.id },
        data: { status: "ESCALATED", harmScore: harm.score, answeredAt: null },
      });
      await notifyOps([
        "<b>Входящее требует человека</b>",
        "",
        `<b>Площадка:</b> ${escape(row.platform)} · ${escape(row.kind)}`,
        `<b>Автор:</b> ${escape(row.authorLabel ?? "—")}`,
        row.permalink ? `<b>Ссылка:</b> ${escape(row.permalink)}` : "<b>Ссылка:</b> —",
        `<b>Балл риска:</b> ${harm.score} (${harm.signals.map((signal) => signal.flag).join(", ") || "—"})`,
        "",
        escape(row.text.slice(0, 700)),
        "",
        "Агент такие сообщения не отвечает. Ответ пишет человек, шутка и регистр здесь запрещены.",
      ].join("\n")).catch(() => undefined);
      escalated += 1;
      continue;
    }

    const tone = pickInboundTone({ platform: row.platform, sequence: index });
    const key = replyKey(row.platform, row.externalId);
    try {
      await db.externalPublication.create({
        data: {
          key,
          platform: row.platform,
          title: `Ответ на входящее: ${row.authorLabel ?? row.platform}`,
          contentType: INBOUND_REPLY_CONTENT_TYPE,
          status: "DRAFT",
          body: null,
          source: "AGENT_INBOUND",
          engagementExcerpt: row.text,
          engagementTargetLabel: row.authorLabel,
          engagementTargetUrl: row.permalink,
          engagementTone: tone.id,
          scheduledFor: now,
          autoPublish: false,
          inboundReplyToId: row.id,
          cluster: row.kind,
        },
      });
      await db.marketingInboundMessage.update({
        where: { id: row.id },
        data: { status: "DRAFTED", harmScore: harm.score, lastError: null },
      });
      drafted += 1;
    } catch (error) {
      // Уникальный ключ ответа — нормальная гонка двух нод, а не сбой: ответ уже
      // заведён, второй не нужен.
      log.warn("marketing-inbound.reply_exists", {
        inboundId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await db.marketingInboundMessage.updateMany({
        where: { id: row.id, status: "RECEIVED" },
        data: { status: "DRAFTED", harmScore: harm.score },
      });
    }
  }

  return { considered: rows.length, drafted, escalated };
}

/** Ответ ушёл официальным API — входящее закрыто. */
export async function markInboundAnswered(inboundId: string, now = new Date()) {
  return db.marketingInboundMessage.updateMany({
    where: { id: inboundId, status: { in: ["RECEIVED", "DRAFTED"] } },
    data: { status: "ANSWERED", answeredAt: now, lastError: null },
  });
}

export interface InboundWatchdogResult {
  stale: Array<{ id: string; platform: string; status: string; ageHours: number }>;
  notified: boolean;
}

/**
 * Сторож. Входящее без реакции дольше суток — это не «тихо», это незамеченный
 * человек: сигнал в кокпите и сообщение в служебный Telegram.
 */
export async function auditUnansweredInbound(
  input: { now?: Date } = {},
): Promise<InboundWatchdogResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - INBOUND_STALE_MS);
  const rows = await db.marketingInboundMessage.findMany({
    where: {
      status: { in: ["RECEIVED", "DRAFTED"] },
      receivedAt: { lt: cutoff },
    },
    orderBy: { receivedAt: "asc" },
    take: 50,
    select: { id: true, platform: true, status: true, receivedAt: true, authorLabel: true },
  });

  const stale = rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    status: row.status,
    ageHours: Math.round((now.getTime() - row.receivedAt.getTime()) / 3_600_000),
  }));

  if (stale.length === 0) {
    await resolveMarketingSignal("inbound:stalled").catch(() => undefined);
    return { stale, notified: false };
  }

  await upsertMarketingSignal({
    key: "inbound:stalled",
    kind: "INBOUND",
    severity: "WARNING",
    title: `Входящие без ответа дольше суток: ${stale.length}`,
    summary: stale
      .slice(0, 5)
      .map((row) => `${row.platform} — ${row.status}, ${row.ageHours} ч`)
      .join("; "),
    evidence: { rows: stale },
  }).catch(() => undefined);

  // Сообщение в Telegram — не чаще раза в шесть часов: сторож должен будить, а
  // не превращаться в фон, который перестают читать.
  const marker = await db.platformSetting.findUnique({
    where: { key: STALE_NOTIFY_SETTING_KEY },
    select: { value: true },
  }).catch(() => null);
  const lastNotifiedAt = marker?.value ? Date.parse(marker.value) : Number.NaN;
  if (Number.isFinite(lastNotifiedAt) && now.getTime() - lastNotifiedAt < STALE_NOTIFY_INTERVAL_MS) {
    return { stale, notified: false };
  }
  const notified = await notifyOps([
    "<b>Входящие без ответа</b>",
    "",
    `Без реакции дольше 24 часов: ${stale.length}.`,
    ...stale.slice(0, 5).map((row) => `• ${escape(row.platform)} — ${escape(row.status)}, ${row.ageHours} ч`),
    "",
    "Проверьте очередь в кокпите: /admin/marketing/agent.",
  ].join("\n")).catch(() => false);
  if (notified) {
    await db.platformSetting.upsert({
      where: { key: STALE_NOTIFY_SETTING_KEY },
      create: {
        key: STALE_NOTIFY_SETTING_KEY,
        value: now.toISOString(),
        updatedBy: "marketing-inbound-watchdog",
      },
      update: { value: now.toISOString(), updatedBy: "marketing-inbound-watchdog" },
    }).catch(() => undefined);
  }
  return { stale, notified };
}

/**
 * Термины, по которым узнаём упоминание бренда. Транслитерации нужны: люди пишут
 * «етерапи» латиницей и кириллицей примерно одинаково часто.
 */
export const BRAND_MENTION_TERMS = ["eterapy", "етерапи", "этерапи"] as const;

export interface InboundPollOutcome {
  platform: InboundPlatform;
  found: number;
  ingested: number;
  error?: string;
}

/**
 * Reddit не присылает webhook: входящее забирается из личного ящика бренд-
 * аккаунта официальным API. Прочитанные помечаем прочитанными, но дедупликация
 * всё равно лежит в базе — потеря отметки не должна давать второй ответ.
 */
async function pollRedditInbound(): Promise<{ found: number; ingested: number }> {
  const token = await redditAccessToken();
  const response = await fetch("https://oauth.reddit.com/message/unread?limit=25", {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": await marketingPlatformValue("REDDIT_USER_AGENT") || "ETerapySMM/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Reddit inbox HTTP ${response.status}`);
  const payload = await response.json().catch(() => null) as {
    data?: {
      children?: Array<{
        kind?: string;
        data?: {
          name?: string;
          author?: string;
          body?: string;
          context?: string;
          parent_id?: string;
          subject?: string;
        };
      }>;
    };
  } | null;

  const children = payload?.data?.children ?? [];
  const names: string[] = [];
  let ingested = 0;
  for (const child of children) {
    const item = child.data;
    if (!item?.name || !item.body) continue;
    const kind: InboundKind = /mention/i.test(item.subject ?? "") ? "MENTION" : "COMMENT";
    const result = await ingestInboundMessage({
      platform: "reddit",
      kind,
      externalId: item.name,
      threadId: item.parent_id ?? null,
      authorLabel: item.author ? `u/${item.author}` : null,
      text: item.body,
      permalink: item.context ? `https://www.reddit.com${item.context}` : null,
    });
    names.push(item.name);
    if (result?.created) ingested += 1;
  }
  if (names.length > 0) {
    await fetch("https://oauth.reddit.com/api/read_message", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": await marketingPlatformValue("REDDIT_USER_AGENT") || "ETerapySMM/1.0",
      },
      body: new URLSearchParams({ id: names.join(",") }),
    }).catch(() => undefined);
  }
  return { found: children.length, ingested };
}

/**
 * Упоминания бренда в VK. Комментарии к нашим постам и сообщения сообщества
 * приходят Callback API; поиск нужен ровно для того, что webhook не покрывает —
 * когда о нас говорят на чужой стене.
 */
async function pollVkMentions(): Promise<{ found: number; ingested: number }> {
  const token = await marketingPlatformValue("VK_USER_TOKEN");
  if (!token) return { found: 0, ingested: 0 };
  let found = 0;
  let ingested = 0;
  for (const term of BRAND_MENTION_TERMS) {
    const response = await fetch("https://api.vk.com/method/newsfeed.search", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token, v: "5.199", q: term, count: "10" }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null) as {
      response?: { items?: Array<{ owner_id?: number; id?: number; text?: string }> };
      error?: { error_msg?: string };
    } | null;
    if (payload?.error) throw new Error(`VK mentions: ${payload.error.error_msg ?? "unknown error"}`);
    for (const item of payload?.response?.items ?? []) {
      if (!item.owner_id || !item.id || !(item.text ?? "").trim()) continue;
      found += 1;
      const result = await ingestInboundMessage({
        platform: "vk",
        kind: "MENTION",
        externalId: `${item.owner_id}_${item.id}`,
        threadId: `${item.owner_id}_${item.id}`,
        authorLabel: `VK wall${item.owner_id}`,
        text: item.text ?? "",
        permalink: `https://vk.com/wall${item.owner_id}_${item.id}`,
      });
      if (result?.created) ingested += 1;
    }
  }
  return { found, ingested };
}

/**
 * Опрос тех площадок, у которых нет webhook. Threads и Instagram присылают
 * события сами, поэтому здесь их нет — иначе один и тот же комментарий пришёл бы
 * дважды (дубль отсекла бы база, но лишний трафик и путаница остались бы).
 */
export async function pollInboundSources(
  input: { now?: Date } = {},
): Promise<InboundPollOutcome[]> {
  const outcomes: InboundPollOutcome[] = [];
  const pollers: Array<{
    platform: InboundPlatform;
    connector: "Reddit" | "VK";
    run: () => Promise<{ found: number; ingested: number }>;
  }> = [
    { platform: "reddit", connector: "Reddit", run: pollRedditInbound },
    { platform: "vk", connector: "VK", run: pollVkMentions },
  ];

  for (const poller of pollers) {
    if (!await marketingPlatformEnabled(poller.connector).catch(() => false)) {
      outcomes.push({ platform: poller.platform, found: 0, ingested: 0 });
      continue;
    }
    try {
      const result = await poller.run();
      await resolveMarketingSignal(`inbound:${poller.platform}`).catch(() => undefined);
      outcomes.push({ platform: poller.platform, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await upsertMarketingSignal({
        key: `inbound:${poller.platform}`,
        kind: "INBOUND",
        severity: "WARNING",
        title: `Не читается входящее: ${poller.platform}`,
        summary: message,
        evidence: { platform: poller.platform },
      }).catch(() => undefined);
      log.error("marketing-inbound.poll_failed", {
        platform: poller.platform,
        error: serializeError(error),
      });
      outcomes.push({ platform: poller.platform, found: 0, ingested: 0, error: message });
    }
  }
  // Дата в input оставлена для симметрии с остальными циклами воркера и для
  // прогонов с фиксированным временем.
  void input.now;
  return outcomes;
}
