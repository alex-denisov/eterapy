/**
 * B678.5 — контроль карты дня в одном месте.
 *
 * Владелец просил механику «в суперадминке, в аналитике и везде, где должен
 * быть контроль». Разные ответы на вопрос «работает ли она» живут в разных
 * таблицах: доставка — в очереди работ, интерес — в аналитике, готовность
 * текстов — в кэше трактовок. Пока их надо складывать глазами, ответа нет ни у
 * кого, поэтому сводка собирается здесь и рисуется одним блоком.
 *
 * Отдельно считается «сколько людей вообще подписано»: ноль получателей — это
 * НЕ сбой рассылки, а отсутствие привязанных Telegram, и различать эти два
 * состояния важнее всех остальных чисел на экране.
 */
import db from "@/lib/db";
import { tarotDayDueHourMsk, tarotDayKey } from "@/lib/tarot-day";
import { tarotDayInterpretationCoverage } from "@/lib/tarot-day-content";
import { NOTIFICATION_DELIVERY_JOB_TYPE } from "@/lib/notification-delivery";
import { tarotDayDeliveryPrefix } from "@/lib/tarot-day-broadcast";
import { mskDayRange } from "@/lib/msk-time";

export interface TarotDayStatus {
  dayKey: string;
  dueHourMsk: number;
  /** Клиенты с привязанным Telegram и включённым переключателем карты дня. */
  recipients: number;
  /** Доставки карты дня, поставленные в очередь за сегодняшние МСК-сутки. */
  queuedToday: number;
  deliveredToday: number;
  failedToday: number;
  /** Сколько из 156 трактовок уже сгенерировано моделью. */
  interpretations: { cached: number; total: number };
  /** Интерес: просмотры блока и переходы на «Расклад Таро» за сегодня. */
  viewsToday: number;
  ctaClicksToday: number;
}

export async function getTarotDayStatus(now: Date = new Date()): Promise<TarotDayStatus> {
  const { start, end } = mskDayRange(now);
  // B684: сводка считает доставки по СУТКАМ КАРТЫ, а не по календарным. Иначе
  // между полуночью и 7 утра она смотрела бы на ключ, по которому рассылки ещё
  // не было, и показывала бы «разослано 0» на исправно работающем контуре.
  const dayKey = tarotDayKey(now);
  // Ключ доставки уникален на человека и сутки — он же служит признаком
  // «это карта дня», потому что тип работы у всех уведомлений общий.
  const idempotencyPrefix = tarotDayDeliveryPrefix(dayKey);

  const [recipients, deliveries, interpretations, viewsToday, ctaClicksToday] = await Promise.all([
    db.user.count({
      where: {
        role: "CLIENT",
        deletedAt: null,
        blockedAt: null,
        telegramId: { not: null },
        notificationPrefs: { some: { event: "DAILY_CARD", channel: "TELEGRAM", enabled: true } },
      },
    }),
    db.job.groupBy({
      by: ["status"],
      where: {
        type: NOTIFICATION_DELIVERY_JOB_TYPE,
        idempotencyKey: { startsWith: idempotencyPrefix },
      },
      _count: { _all: true },
    }),
    tarotDayInterpretationCoverage(),
    db.analyticsEvent.count({ where: { event: "tarot_day_viewed", createdAt: { gte: start, lt: end } } }),
    db.analyticsEvent.count({ where: { event: "tarot_day_cta_clicked", createdAt: { gte: start, lt: end } } }),
  ]);

  const byStatus = new Map(deliveries.map((row) => [row.status, row._count._all]));
  const queuedToday = deliveries.reduce((sum, row) => sum + row._count._all, 0);

  return {
    dayKey,
    dueHourMsk: tarotDayDueHourMsk(now),
    recipients,
    queuedToday,
    deliveredToday: byStatus.get("SUCCEEDED") ?? 0,
    failedToday: (byStatus.get("FAILED") ?? 0) + (byStatus.get("DEAD") ?? 0),
    interpretations,
    viewsToday,
    ctaClicksToday,
  };
}
