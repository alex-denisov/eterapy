/**
 * B636 — пауза канала вместо отмены публикации.
 *
 * ЧТО БЫЛО НЕ ТАК. Выпуск обрабатывал любой отказ одинаково: строка уходила в
 * `FAILED`, а через час сверка реестра архивировала её, если слот уже прошёл.
 * Для дефекта самого материала это правильно. Для отказа канала — нет: упал не
 * материал, а дорога наружу, и материал ни в чём не виноват. Владелец
 * 2026-07-31: «если возникла ошибка серверного характера, вся очередь
 * публикации должна быть приостановлена до тех пор, пока ошибка не будет
 * решена, а не отменять публикацию и переносить её в архив. При восстановлении
 * доступа все публикации из отложенного переходят в обычный режим».
 *
 * КАК УСТРОЕНО. Пауза — свойство КАНАЛА, а не строки. Пока канал на паузе:
 *  • ни одна его строка не меняет статус — все остаются `SCHEDULED`;
 *  • ничего не архивируется по прошедшему слоту;
 *  • раз в интервал через канал пропускается ОДНА строка-разведчик.
 *
 * Разведчик — это и есть проверка «доступ восстановился». Отдельной пробы
 * доступности у площадок нет: единственный честный признак того, что публикация
 * пройдёт, — это прошедшая публикация. Успех разведчика снимает паузу, и
 * остальная очередь идёт обычным путём тем же или следующим тиком.
 *
 * Интервал между разведчиками растёт (10 → 20 → 40 → 60 минут) — чтобы
 * недоступная площадка не получала запрос каждую минуту сутками, но чтобы
 * вернувшийся канал ожил в пределах часа без единого действия человека.
 */

import db from "@/lib/db";
import { log } from "@/lib/logger";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";

const HOLD_KEY_PREFIX = "marketing.publish.hold.";

/** Шаги отступа между разведчиками. Последний повторяется. */
export const HOLD_PROBE_BACKOFF_MS = [10 * 60_000, 20 * 60_000, 40 * 60_000, 60 * 60_000];

export interface ChannelHold {
  platform: string;
  reason: string;
  heldSince: string;
  /** Сколько раз разведчик уже уходил и возвращался с отказом. */
  probeCount: number;
  nextProbeAt: string;
}

/**
 * Признаки отказа КАНАЛА, а не материала.
 *
 * Граница проведена по вопросу «повторная попытка тем же текстом имеет шанс?».
 * Пятисотка площадки, оборванная сеть, истёкший таймаут, исчерпанный лимит
 * запросов, отозванный или протухший токен — да, как только внешняя причина
 * пройдёт. Слишком длинная подпись, пустое тело, неверный id адресата — нет:
 * тот же текст даст тот же отказ, и держать из-за него всю очередь значило бы
 * останавливать канал из-за одной кривой строки.
 */
const CHANNEL_ERROR_MARKERS = [
  "fetch failed",
  "timeout",
  "timed out",
  "aborted",
  "econnreset",
  "econnrefused",
  "enotfound",
  "socket hang up",
  "network",
  "http 429",
  "http 500",
  "http 502",
  "http 503",
  "http 504",
  "http 520",
  "http 521",
  "http 522",
  "http 524",
  "internal server error",
  "service unavailable",
  "bad gateway",
  "rate limit",
  "too many requests",
  "relay failed",
  // Доступ: токен отозван, протух или прав не хватает. Материал здесь тоже ни
  // при чём — это ровно «доступ к каналу», о восстановлении которого говорит
  // формулировка владельца.
  "access token",
  "token has expired",
  "session has expired",
  "oauth",
  "unauthorized",
  "http 401",
  "http 403",
  "is not configured",
  "connector is disabled",
];

/** Коды VK, означающие состояние площадки или доступа, а не текст поста. */
const VK_CHANNEL_ERROR_CODES = [
  "(1)", // Unknown error occurred
  "(5)", // User authorization failed
  "(6)", // Too many requests per second
  "(9)", // Flood control
  "(10)", // Internal server error
  "(15)", // Access denied
  "(27)", // Group authorization failed
];

export function isChannelLevelPublicationError(error: string | null | undefined): boolean {
  if (!error) return false;
  const message = error.toLowerCase();
  if (CHANNEL_ERROR_MARKERS.some((marker) => message.includes(marker))) return true;
  return VK_CHANNEL_ERROR_CODES.some((code) => message.includes(code));
}

function holdKey(platform: string) {
  return `${HOLD_KEY_PREFIX}${platform.toLowerCase()}`;
}

function parseHold(platform: string, value: string): ChannelHold | null {
  try {
    const parsed = JSON.parse(value) as Partial<ChannelHold>;
    if (!parsed.heldSince || !parsed.nextProbeAt) return null;
    return {
      platform: platform.toLowerCase(),
      reason: parsed.reason ?? "причина не записана",
      heldSince: parsed.heldSince,
      probeCount: typeof parsed.probeCount === "number" ? parsed.probeCount : 0,
      nextProbeAt: parsed.nextProbeAt,
    };
  } catch {
    return null;
  }
}

export async function listChannelHolds(): Promise<ChannelHold[]> {
  const rows = await db.platformSetting.findMany({
    where: { key: { startsWith: HOLD_KEY_PREFIX } },
    select: { key: true, value: true },
  }).catch(() => [] as Array<{ key: string; value: string }>);
  return rows
    .map((row) => parseHold(row.key.slice(HOLD_KEY_PREFIX.length), row.value))
    .filter((hold): hold is ChannelHold => hold !== null);
}

export async function channelHold(platform: string): Promise<ChannelHold | null> {
  const row = await db.platformSetting.findUnique({
    where: { key: holdKey(platform) },
    select: { value: true },
  }).catch(() => null);
  return row ? parseHold(platform, row.value) : null;
}

/**
 * Поставить канал на паузу или продлить её после неудачного разведчика.
 * Момент начала паузы не переписывается: по нему видно, сколько канал стоит.
 */
export async function holdChannel(input: {
  platform: string;
  reason: string;
  now: Date;
  previous?: ChannelHold | null;
}): Promise<ChannelHold> {
  const probeCount = (input.previous?.probeCount ?? -1) + 1;
  const backoff = HOLD_PROBE_BACKOFF_MS[
    Math.min(probeCount, HOLD_PROBE_BACKOFF_MS.length - 1)
  ];
  const hold: ChannelHold = {
    platform: input.platform.toLowerCase(),
    reason: input.reason,
    heldSince: input.previous?.heldSince ?? input.now.toISOString(),
    probeCount,
    nextProbeAt: new Date(input.now.getTime() + backoff).toISOString(),
  };
  const value = JSON.stringify(hold);
  await db.platformSetting.upsert({
    where: { key: holdKey(input.platform) },
    create: { key: holdKey(input.platform), value, updatedBy: "marketing-worker" },
    update: { value, updatedBy: "marketing-worker" },
  });

  const queued = await db.externalPublication.count({
    where: { status: "SCHEDULED", platform: { equals: input.platform, mode: "insensitive" } },
  }).catch(() => 0);
  // B677: «канал не подключён» и «канал сломался» — разные вещи, а severity у
  // них была одна. Instagram и Threads стоят потому, что владелец сознательно
  // не заводил их доступ (внешний гейт B610/B655), и висели на доске как
  // INCIDENT неделями рядом с настоящими сбоями. Отсутствие ключа — ожидание,
  // а не инцидент; всё остальное — по-прежнему инцидент.
  const awaitingSetup = /\bis not configured\b|\bnot configured\b|отключ|disabled/i.test(input.reason);
  await upsertMarketingSignal({
    key: `publish-hold:${hold.platform}`,
    kind: "REGISTRY",
    severity: awaitingSetup ? "WARNING" : "INCIDENT",
    title: `${input.platform}: очередь публикаций приостановлена`,
    summary: `Отказ на стороне канала: ${input.reason}. Материалы не отменены и не заархивированы — `
      + `в очереди ожидают ${queued}. Следующая проверка доступа: `
      + `${new Date(hold.nextProbeAt).toISOString()}. Как только публикация пройдёт, очередь пойдёт сама.`,
    evidence: { platform: hold.platform, heldSince: hold.heldSince, probeCount, queued },
  }).catch(() => undefined);

  log.warn("marketing.channel_held", {
    platform: hold.platform,
    reason: input.reason,
    probeCount,
    queued,
  });
  return hold;
}

export async function releaseChannel(platform: string): Promise<void> {
  await db.platformSetting.deleteMany({ where: { key: holdKey(platform) } }).catch(() => undefined);
  await resolveMarketingSignal(`publish-hold:${platform.toLowerCase()}`).catch(() => undefined);
  log.info("marketing.channel_released", { platform: platform.toLowerCase() });
}

/**
 * Что делать с очередной строкой канала: пропустить целиком, пустить одну
 * строку разведчиком или идти обычным путём.
 */
export function holdDecision(input: {
  hold: ChannelHold | null;
  now: Date;
  /** Разведчик за этот проход уже уходил. */
  probeSpent: boolean;
}): "publish" | "probe" | "hold" {
  if (!input.hold) return "publish";
  if (input.probeSpent) return "hold";
  return new Date(input.hold.nextProbeAt).getTime() <= input.now.getTime() ? "probe" : "hold";
}
