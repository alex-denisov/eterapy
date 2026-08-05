/**
 * B678 — утренняя рассылка карты дня в Telegram-бот.
 *
 * ПОЧЕМУ ЭТО НЕ `notify()`. `notify()` рассылает событие во ВСЕ включённые
 * каналы, а у `DAILY_CARD` почта по умолчанию включена (`isEnabled` считает
 * отсутствие строки согласием для EMAIL и WEB). Позвать его здесь означало бы
 * ежедневное письмо каждому клиенту — того, чего владелец не просил и что
 * быстро вернулось бы жалобами. Владелец просил бот, поэтому очередь доставки
 * зовётся напрямую и ровно одним каналом.
 *
 * ЛИНИЯ СЛУЖЕБНАЯ (решение владельца). Согласия на рекламу рассылка не
 * спрашивает, но переключатель `DAILY_CARD`/`TELEGRAM` в кабинете уважает — и
 * он же служит отпиской. Тихие часы человека соблюдаются: в 7:00 они у многих
 * ещё активны, и правильный ответ — отложить, а не разбудить.
 *
 * ИДЕМПОТЕНТНОСТЬ ПО МСК-СУТКАМ. Ключ доставки — `tarot-day:<user>:<МСК-дата>`.
 * Работа ставится часовой каденцией (см. `tarotDayBroadcastDue`), поэтому за
 * сутки её обработчик вызовется много раз — и все вызовы после первого не
 * добавят ни одного сообщения.
 */
import type { Job } from "@prisma/client";
import db from "@/lib/db";
import { APP_URL } from "@/lib/env";
import type { JobResult } from "@/lib/job-queue";
import { log, serializeError } from "@/lib/logger";
import {
  logNotificationDeliveryQueueFailure,
  queueNotificationDelivery,
} from "@/lib/notification-delivery";
import { getQuietHoursDelayMs, getUserQuietHours } from "@/lib/notification-preference-settings";
import { absoluteMainUrl } from "@/lib/subdomain";
import { getTarotDayInterpretation } from "@/lib/tarot-day-content";
import { mskDayKey, tarotDayBroadcastDue, tarotDayDueHourMsk, tarotDayPick } from "@/lib/tarot-day";

/** Потолок одной пробежки: рассылка идёт каждый час, остаток догоняется следующей. */
const BROADCAST_BATCH_LIMIT = 500;

/**
 * Сколько НЕДОСТАЮЩИХ трактовок дописывать за одну пробежку.
 *
 * Рассылка не имеет права ждать модель. Воркер считает работу зависшей через
 * 10 минут (`DEFAULT_STALE_AFTER_MS` в `job-worker.ts`) и возвращает её в
 * очередь, а генерация 156 текстов подряд по 2–5 секунд этот порог перешагивает
 * с запасом: первое же утро превратилось бы в переставляемую работу вместо
 * отправки. Поэтому текст берётся из кэша, недостающие дописываются по
 * несколько штук за раз, и библиотека наполняется за несколько утр. До тех пор
 * человек видит детерминированную трактовку — она осмысленна, а не заглушка.
 */
const WARM_INTERPRETATIONS_PER_RUN = 8;

/** Префикс суток в ключе доставки — по нему сводка считает сегодняшнюю рассылку. */
export function tarotDayDeliveryPrefix(dayKey: string) {
  return `tarot-day:${dayKey}:`;
}

export function tarotDayDeliveryKey(dayKey: string, userId: string) {
  return `${tarotDayDeliveryPrefix(dayKey)}${userId}:TELEGRAM`;
}

export interface TarotDayBroadcastResult extends JobResult {
  ok: boolean;
  due: boolean;
  dayKey: string;
  dueHourMsk: number;
  candidates: number;
  queued: number;
  failed: number;
  /** Сколько трактовок дописано моделью за эту пробежку. */
  warmed: number;
}

function miniAppUrl() {
  return process.env.TELEGRAM_MINIAPP_URL
    || new URL("/miniapp?miniapp=telegram&entry=daily_card", APP_URL).toString();
}

/**
 * Ставит в очередь карту дня всем, у кого привязан Telegram и включён
 * переключатель `DAILY_CARD`. Тотальная по отношению к одному человеку: сбой у
 * одного не отменяет рассылку остальным.
 */
export async function broadcastTarotDay(now: Date = new Date()): Promise<TarotDayBroadcastResult> {
  const dayKey = mskDayKey(now);
  const dueHourMsk = tarotDayDueHourMsk(now);

  if (!tarotDayBroadcastDue(now)) {
    return { ok: true, due: false, dayKey, dueHourMsk, candidates: 0, queued: 0, failed: 0, warmed: 0 };
  }

  const recipients = await db.user.findMany({
    where: {
      role: "CLIENT",
      deletedAt: null,
      blockedAt: null,
      telegramId: { not: null },
      notificationPrefs: { some: { event: "DAILY_CARD", channel: "TELEGRAM", enabled: true } },
    },
    select: { id: true, name: true, email: true, telegramId: true, timezone: true },
    take: BROADCAST_BATCH_LIMIT,
  });

  let queued = 0;
  let failed = 0;
  let warmed = 0;

  for (const user of recipients) {
    const pick = tarotDayPick(user.id, now);
    // Генерация разрешена только первым нескольким за пробежку — см.
    // WARM_INTERPRETATIONS_PER_RUN. `source === "ai"` означает, что текста в
    // кэше не было и он только что появился.
    const { interpretation, source } = await getTarotDayInterpretation(pick, {
      allowGenerate: warmed < WARM_INTERPRETATIONS_PER_RUN,
    });
    if (source === "ai") warmed++;
    const quietHours = await getUserQuietHours(user.id, user.timezone);
    const quietDelayMs = getQuietHoursDelayMs(quietHours, now);

    const delivery = {
      userId: user.id,
      event: "DAILY_CARD" as const,
      channel: "TELEGRAM" as const,
      data: {
        cardName: pick.card.name,
        reversed: pick.reversed ? "1" : "0",
        headline: interpretation.headline,
        body: interpretation.body,
        focus: interpretation.focus,
        question: interpretation.question,
        miniAppUrl: miniAppUrl(),
        photoUrl: absoluteMainUrl(`/api/cards/day/${pick.key}`),
      },
      recipient: { email: user.email, name: user.name, telegramId: user.telegramId },
      runAfter: quietDelayMs > 0 ? new Date(now.getTime() + quietDelayMs) : undefined,
      // Дата ПЕРЕД человеком: так суточная выборка в сводке (`tarot-day-status`)
      // остаётся запросом по префиксу, а не поиском подстроки в середине ключа.
      idempotencyKey: tarotDayDeliveryKey(dayKey, user.id),
    };

    try {
      await queueNotificationDelivery(delivery);
      queued++;
    } catch (err) {
      failed++;
      logNotificationDeliveryQueueFailure(delivery, err);
    }
  }

  const result = {
    ok: failed === 0,
    due: true,
    dayKey,
    dueHourMsk,
    candidates: recipients.length,
    queued,
    failed,
    warmed,
  };
  log.info("tarot-day-broadcast-completed", result);
  return result;
}

export async function runTarotDayBroadcastJob(job: Job): Promise<JobResult> {
  const requestedAt = (job.payload as { requestedAt?: string } | null)?.requestedAt;
  const now = requestedAt ? new Date(requestedAt) : new Date();
  try {
    const result = await broadcastTarotDay(now);
    return { ...result, timestamp: now.toISOString() };
  } catch (error) {
    log.error("tarot-day-broadcast-failed", { jobId: job.id, error: serializeError(error) });
    throw error;
  }
}
