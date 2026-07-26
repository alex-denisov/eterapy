import type { Job } from "@prisma/client";
import { z } from "zod";
import db from "@/lib/db";
import { sendEmail } from "@/lib/email-send";
import { enqueueJob, type JobResult } from "@/lib/job-queue";
import { log, serializeError } from "@/lib/logger";
import { getTelegramRuntimeConfig, sendTelegram } from "@/lib/telegram";
import type { NotifEvent } from "@/lib/notification-events";
import { APP_URL } from "@/lib/env";

export const NOTIFICATION_DELIVERY_JOB_TYPE = "notification.delivery";
export const NOTIFICATION_DELIVERY_MAX_ATTEMPTS = 3;

const deliveryPayloadSchema = z.object({
  userId: z.string().min(1),
  event: z.string().min(1),
  channel: z.enum(["EMAIL", "TELEGRAM", "WEB"]),
  data: z.record(z.string(), z.string()),
  recipient: z.object({
    email: z.string().email().nullable().optional(),
    name: z.string().nullable().optional(),
    telegramId: z.string().nullable().optional(),
  }),
  requestId: z.string().optional(),
});

export type NotificationDeliveryChannel = z.infer<typeof deliveryPayloadSchema>["channel"];
export type NotificationDeliveryPayload = z.infer<typeof deliveryPayloadSchema>;

export interface QueueNotificationDeliveryInput {
  userId: string;
  event: NotifEvent;
  channel: NotificationDeliveryChannel;
  data: Record<string, string>;
  recipient: NotificationDeliveryPayload["recipient"];
  runAfter?: Date;
  idempotencyKey?: string;
  requestId?: string;
}

export async function queueNotificationDelivery(input: QueueNotificationDeliveryInput) {
  const payload: NotificationDeliveryPayload = {
    userId: input.userId,
    event: input.event,
    channel: input.channel,
    data: input.data,
    recipient: input.recipient,
    requestId: input.requestId,
  };

  return enqueueJob({
    type: NOTIFICATION_DELIVERY_JOB_TYPE,
    queue: "default",
    payload,
    maxAttempts: NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
    runAfter: input.runAfter,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
  });
}

export async function handleNotificationDeliveryJob(job: Job): Promise<JobResult> {
  const parsed = deliveryPayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    throw new Error("Invalid notification delivery payload");
  }

  const payload = parsed.data;
  const event = payload.event as NotifEvent;

  if (payload.channel === "EMAIL") {
    if (!payload.recipient.email) throw new Error("Missing email recipient");
    await sendEmail({
      to: payload.recipient.email,
      event,
      name: payload.recipient.name ?? "",
      data: payload.data,
    });
  }

  if (payload.channel === "TELEGRAM") {
    if (!payload.recipient.telegramId) throw new Error("Missing Telegram recipient");
    try {
      await sendTelegram(payload.recipient.telegramId, formatTelegramMessage(event, payload.recipient.name ?? "", payload.data));
    } catch (err) {
      log.error("notification-telegram-delivery-failed", {
        requestId: payload.requestId,
        jobId: job.id,
        event,
        userId: payload.userId,
        telegram: getTelegramRuntimeConfig(),
        error: serializeError(err),
      });
      throw err;
    }
  }

  if (payload.channel === "WEB") {
    const web = formatWebNotification(event, payload.data);
    await db.notification.create({
      data: {
        userId: payload.userId,
        event,
        title: web.title,
        body: web.body,
        href: web.href ?? null,
      },
    });
  }

  log.info("notification-delivery-sent", {
    requestId: payload.requestId,
    jobId: job.id,
    event,
    channel: payload.channel,
    userId: payload.userId,
  });

  return {
    ok: true,
    channel: payload.channel,
    event,
  };
}

export function logNotificationDeliveryQueueFailure(input: QueueNotificationDeliveryInput, err: unknown) {
  log.error("notification-delivery-enqueue-failed", {
    requestId: input.requestId,
    event: input.event,
    channel: input.channel,
    userId: input.userId,
    error: serializeError(err),
  });
}

function formatWebNotification(event: NotifEvent, data: Record<string, string>): { title: string; body: string; href?: string } {
  switch (event) {
    case "BOOKING_REQUESTED":
      // B466: заявки живут в «Календарь → Заявки».
      return { title: "Новая запись", body: `${data.clientName} — ${data.date}, ${data.time}`, href: "/cabinet/practitioner/calendar?tab=requests" };
    case "BOOKING_CONFIRMED":
      return { title: "Запись подтверждена", body: `${data.date} в ${data.time}`, href: data.sessionUrl ?? "/cabinet/bookings" };
    case "BOOKING_CANCELLED":
      return { title: "Запись отменена", body: `${data.date}${data.reason ? ` — ${data.reason}` : ""}`, href: "/cabinet/bookings" };
    case "BOOKING_PROPOSED":
      // B480: специалист предложил слот — клиент подтверждает и оплачивает.
      return { title: "Специалист предложил время", body: `${data.practitionerName} — ${data.date}, ${data.time}`, href: "/cabinet/bookings" };
    case "BOOKING_CHANGE_REQUESTED":
      // B481: запрос переноса/отмены — согласование другой стороной.
      return {
        title: data.type === "CANCEL" ? "Запрос на отмену сессии" : "Запрос на перенос сессии",
        body: `${data.byName} · сессия ${data.date} в ${data.time}${data.proposed ? ` → ${data.proposed}` : ""}`,
        href: data.href ?? "/cabinet/bookings",
      };
    case "BOOKING_CHANGE_RESOLVED":
      return {
        title: data.approved === "1"
          ? (data.type === "CANCEL" ? "Отмена согласована" : "Перенос согласован")
          : (data.type === "CANCEL" ? "В отмене отказано" : "В переносе отказано"),
        body: `Сессия ${data.date} в ${data.time}${data.proposed ? ` → ${data.proposed}` : ""}`,
        href: data.href ?? "/cabinet/bookings",
      };
    case "PRACTITIONER_MESSAGE":
      // B478: односторонний материал от специалиста (клиент читает в «Ещё → Сообщения»).
      return { title: "Сообщение от специалиста", body: `${data.practitionerName}${data.preview ? ` — ${data.preview}` : ""}`, href: data.href ?? "/cabinet/messages" };
    case "GOODWILL_CREDITS":
      // B484: компенсационные баллы клиенту за счёт платформы.
      return { title: "Компенсация баллами", body: `+${data.amount} балл(ов). ${data.reason ?? ""}`.trim(), href: "/cabinet/wallet" };
    case "RELIABILITY_WARNING":
      // B484: предупреждение практику о временной деприоритизации.
      return {
        title: "Предупреждение о надёжности",
        body: `За 30 дней: поздних отмен — ${data.lateCancels}, подтверждённых неявок — ${data.noShows}. Профиль временно показывается ниже в каталоге.`,
        href: "/cabinet/practitioner/calendar",
      };
    case "BOOKING_REMINDER":
      return { title: "Напоминание о сессии", body: `Через ${data.in}`, href: data.bookingId ? `/session/${data.bookingId}` : "/cabinet/bookings" };
    case "SESSION_STARTED":
      return { title: "Сессия началась", body: "Видеочат открыт", href: data.bookingId ? `/session/${data.bookingId}` : undefined };
    case "SESSION_COMPLETED":
      return { title: "Сессия завершена", body: data.reviewUrl ? "Оставьте отзыв" : "Спасибо за сессию", href: data.reviewUrl };
    case "REVIEW_REQUESTED":
      return { title: "Оставьте отзыв", body: `Сессия с ${data.practitionerName}`, href: data.reviewUrl };
    case "NEW_REVIEW":
      return { title: "Новый отзыв", body: `${data.clientName}: ${data.rating}/5`, href: "/cabinet/practitioner/reviews" };
    case "PAYMENT_RECEIVED":
      return { title: "Платёж получен", body: `${data.amountRub} ₽ — ${data.date}`, href: "/cabinet/practitioner/earnings" };
    case "PAYOUT_SCHEDULED":
      return { title: "Запланированная выплата", body: `${data.date}: ${data.totalRub} ₽ (${data.practitionerCount})`, href: "/admin/finance/payouts" };
    case "BALANCE_TOPUP":
      return { title: "Баланс пополнен", body: `+${data.amountRub} ₽`, href: "/cabinet/billing" };
    case "PRODUCT_UNLOCKED":
      return { title: "Продукт открыт", body: data.productKey, href: "/cabinet/billing" };
    case "SUBSCRIPTION_STARTED":
      return { title: "Подписка активна", body: `Тариф ${data.planKey}`, href: "/cabinet/billing" };
    case "SUBSCRIPTION_RENEWAL":
      return { title: "Скоро автопродление", body: `Тариф ${data.planLabel || data.planKey} продлится ${data.renewsOn}${data.amountRub ? ` — ${data.amountRub} ₽` : ""}`, href: "/cabinet/billing" };
    case "SUBSCRIPTION_CANCELLED":
      return { title: "Подписка отменена", body: `Тариф ${data.planKey}`, href: "/cabinet/billing" };
    case "SUBSCRIPTION_PAYMENT_FAILED":
      return { title: "Платёж подписки не прошёл", body: `Тариф ${data.planKey}`, href: "/cabinet/billing" };
    case "CARD_LINKED":
      return { title: "Карта привязана", body: `${data.brand} •••• ${data.last4}`, href: "/cabinet/billing" };
    case "CARD_REMOVED":
      return { title: "Карта отвязана", body: `${data.brand} •••• ${data.last4}`, href: "/cabinet/billing" };
    case "DAILY_CARD":
      return { title: data.title || "Карта дня", body: data.body || "Один бережный фокус на сегодня", href: "/cabinet" };
    case "ABANDONED_CHECKOUT":
      return { title: "Оплата не завершена", body: data.productName || "Можно вернуться без спешки", href: data.checkoutUrl || "/pricing" };
    case "REPORT_READY":
      return { title: "Отчет готов", body: data.title || "Ваш разбор готов к чтению", href: data.reportUrl || "/cabinet/diary" };
    case "PARTNER_COMPLETED":
      return { title: "Партнер завершил часть", body: "Можно открыть совместный результат", href: data.reportUrl || "/products/pair" };
    case "CIRCLE_READY":
      return { title: "Разбор готов", body: "Ответов достаточно для общего вывода", href: data.circleUrl || "/products/pair" };
    case "ROUTE_REMINDER":
      return { title: data.title || "Мягкое напоминание", body: data.body || "Один маленький шаг сегодня", href: data.routeUrl || "/cabinet" };
    case "WEEKLY_DIGEST":
      return { title: "Недельный дайджест", body: data.summary || "Ваши практики и вопросы собраны", href: data.digestUrl || "/cabinet" };
    case "PRACTITIONER_DIGEST":
      return { title: "Дайджест специалиста", body: data.summary || "Заявки, встречи, выплаты и отзывы", href: data.digestUrl || "/cabinet/practitioner" };
    case "COMPLIANCE_ALERT":
      return { title: "Комплаенс-сигнал", body: data.summary || "Нужна проверка модератором", href: data.reviewUrl || "/admin/product/quality" };
    case "CREDITS_EXPIRING":
      return { title: "Баллы скоро сгорят", body: `${data.credits || "Несколько"} баллов закончатся через ${data.days || "пару"} дн.`, href: data.walletUrl || "/cabinet/wallet" };
    case "STREAK_AT_RISK":
      return { title: "Ритм практики", body: `Можно сделать один короткий шаг и сохранить ${data.streak || ""} дн.`, href: data.practiceUrl || "/cabinet/diary" };
    case "MOMENT_OF_NEED":
      return { title: "Можно вернуться к теме", body: data.topic ? `Тема: ${data.topic}` : "Ваша карта все еще доступна", href: data.mapUrl || "/cabinet/diary" };
    case "WELCOME_CREDITS":
      return { title: "Приветственные баллы начислены", body: `${data.credits || "3"} балла уже в кошельке`, href: data.walletUrl || "/cabinet/wallet" };
    case "WELCOME_CREDITS_REMINDER":
      return { title: "Приветственные баллы ждут", body: "Можно попробовать первый небольшой разбор", href: data.walletUrl || "/cabinet/wallet" };
    default:
      return { title: "Уведомление", body: "" };
  }
}

function formatTelegramMessage(event: NotifEvent, name: string, data: Record<string, string>): string {
  const baseUrl = APP_URL;
  switch (event) {
    case "BOOKING_REQUESTED":
      return `📅 Новая запись\nКлиент ${data.clientName} хочет записаться на ${data.date} в ${data.time}.\n<a href="${baseUrl}/cabinet/practitioner/clients">Подтвердить →</a>`;
    case "BOOKING_CONFIRMED":
      return `✅ Запись подтверждена\nВаша сессия${data.clientName ? ` с ${data.clientName}` : ""} подтверждена на ${data.date} в ${data.time}.\n${data.sessionUrl ? `<a href="${data.sessionUrl}">Войти в видеочат →</a>` : `<a href="${baseUrl}/cabinet/bookings">Перейти к записям →</a>`}`;
    case "BOOKING_CANCELLED":
      return `❌ Запись отменена\nСессия на ${data.date} отменена${data.reason ? `: ${data.reason}` : ""}.`;
    case "BOOKING_REMINDER":
      return `⏰ Напоминание о сессии\nВаша сессия ${data.withName ? `с ${data.withName} ` : ""}начнётся ${data.in}.\n<a href="${baseUrl}/session/${data.bookingId}">Открыть видеочат →</a>`;
    case "SESSION_STARTED":
      return `🎥 Сессия началась\n<a href="${baseUrl}/session/${data.bookingId}">Войти в видеочат →</a>`;
    case "SESSION_COMPLETED":
      return `🏁 Сессия завершена\nСпасибо за сессию! ${data.reviewUrl ? `<a href="${data.reviewUrl}">Оставить отзыв →</a>` : ""}`;
    case "BOOKING_PROPOSED":
      return `📅 Специалист предложил время\n${data.practitionerName} предлагает сессию ${data.date} в ${data.time}.\n<a href="${baseUrl}/cabinet/bookings">Подтвердить и оплатить →</a>`;
    case "BOOKING_CHANGE_REQUESTED":
      return `${data.type === "CANCEL" ? "❌ Запрос на отмену" : "🔁 Запрос на перенос"}\n${data.byName} просит ${data.type === "CANCEL" ? "отменить" : "перенести"} сессию ${data.date} в ${data.time}${data.proposed ? ` → ${data.proposed}` : ""}.\n<a href="${baseUrl}${data.href ?? "/cabinet/bookings"}">Ответить →</a>`;
    case "BOOKING_CHANGE_RESOLVED":
      return `${data.approved === "1" ? "✅" : "🚫"} ${data.approved === "1" ? (data.type === "CANCEL" ? "Отмена согласована" : "Перенос согласован") : (data.type === "CANCEL" ? "В отмене отказано" : "В переносе отказано")}\nСессия ${data.date} в ${data.time}${data.proposed ? ` → ${data.proposed}` : ""}.\n<a href="${baseUrl}${data.href ?? "/cabinet/bookings"}">Открыть записи →</a>`;
    case "PRACTITIONER_MESSAGE":
      return `💬 Сообщение от специалиста\n${data.practitionerName}${data.preview ? `: ${data.preview}` : ""}\n<a href="${baseUrl}${data.href ?? "/cabinet/messages"}">Прочитать →</a>`;
    case "GOODWILL_CREDITS":
      return `🎁 Компенсация баллами\n+${data.amount} балл(ов). ${data.reason ?? ""}\n<a href="${baseUrl}/cabinet/wallet">Открыть кошелёк →</a>`;
    case "RELIABILITY_WARNING":
      return `⚠️ Предупреждение о надёжности\nЗа 30 дней: поздних отмен — ${data.lateCancels}, подтверждённых неявок — ${data.noShows}. Профиль временно показывается ниже в каталоге.\n<a href="${baseUrl}/cabinet/practitioner/calendar">Открыть календарь →</a>`;
    case "REVIEW_REQUESTED":
      return `⭐ Оставьте отзыв\nКак прошла сессия с ${data.practitionerName}?\n<a href="${data.reviewUrl}">Написать отзыв →</a>`;
    case "NEW_REVIEW":
      return `⭐ Новый отзыв\nКлиент ${data.clientName} оставил отзыв ${data.rating}/5.\n"${data.text}"`;
    case "PAYMENT_RECEIVED":
      return `💰 Платёж получен\n${data.amountRub} ₽ за сессию ${data.date}.`;
    case "PAYOUT_SCHEDULED":
      return `🏦 Запланированная выплата\n${data.date}: ${data.totalRub} ₽ для ${data.practitionerCount} практиков.`;
    case "BALANCE_TOPUP":
      return `💳 Баланс пополнен\nНа ваш счёт зачислено ${data.amountRub} ₽.\n<a href="${baseUrl}/cabinet/billing">Открыть кошелёк →</a>`;
    case "PRODUCT_UNLOCKED":
      return `✨ Продукт открыт\nДоступ к ${data.productKey} активен.\n<a href="${baseUrl}/cabinet/billing">Открыть доступы →</a>`;
    case "SUBSCRIPTION_STARTED":
      return `✨ Подписка активна\nТариф ${data.planKey} подключён.\n<a href="${baseUrl}/cabinet/billing">Управлять подпиской →</a>`;
    case "SUBSCRIPTION_RENEWAL":
      return `🔄 Скоро автопродление\nТариф ${data.planLabel || data.planKey} продлится ${data.renewsOn}${data.amountRub ? ` на сумму ${data.amountRub} ₽` : ""}.\n<a href="${baseUrl}/cabinet/billing">Управлять подпиской →</a>`;
    case "SUBSCRIPTION_CANCELLED":
      return `Подписка отменена\nТариф ${data.planKey}. Подробности доступны в биллинге.\n<a href="${baseUrl}/cabinet/billing">Открыть биллинг →</a>`;
    case "SUBSCRIPTION_PAYMENT_FAILED":
      return `Платёж подписки не прошёл\nТариф ${data.planKey} требует внимания.\n<a href="${baseUrl}/cabinet/billing">Проверить оплату →</a>`;
    case "CARD_LINKED":
      return `🔗 Карта привязана\n${data.brand} •••• ${data.last4} теперь доступна для быстрой оплаты.`;
    case "CARD_REMOVED":
      return `🗑 Карта отвязана\n${data.brand} •••• ${data.last4} удалена из списка карт.`;
    case "DAILY_CARD":
      return `Карта дня ETerapy\n<b>${data.title}</b>\n${data.body}\n<a href="${baseUrl}/cabinet">Открыть кабинет →</a>${data.shareUrl ? `\n<a href="${data.shareUrl}">Поделиться бережно →</a>` : ""}`;
    case "ABANDONED_CHECKOUT":
      return `Оплату можно завершить\n${data.productName ?? "Выбранный продукт"}.\n<a href="${data.checkoutUrl ?? `${baseUrl}/pricing`}">Вернуться →</a>`;
    case "REPORT_READY":
      return `Отчет готов\n${data.title ?? "Ваш разбор готов к чтению"}.\n<a href="${data.reportUrl ?? `${baseUrl}/cabinet/diary`}">Открыть →</a>`;
    case "PARTNER_COMPLETED":
      return `Партнер завершил свою часть\n<a href="${data.reportUrl ?? `${baseUrl}/products/pair`}">Открыть результат →</a>`;
    case "CIRCLE_READY":
      return `Разбор готов\n<a href="${data.circleUrl ?? `${baseUrl}/products/pair`}">Открыть разбор →</a>`;
    case "ROUTE_REMINDER":
      return `${data.title ?? "Мягкое напоминание"}\n${data.body ?? "Можно вернуться к маршруту."}\n<a href="${data.routeUrl ?? `${baseUrl}/cabinet`}">Продолжить →</a>`;
    case "WEEKLY_DIGEST":
      return `Недельный дайджест\n${data.summary ?? "Ваши практики и вопросы собраны."}\n<a href="${data.digestUrl ?? `${baseUrl}/cabinet`}">Открыть →</a>`;
    case "PRACTITIONER_DIGEST":
      return `Дайджест специалиста\n${data.summary ?? "Заявки, встречи, выплаты и отзывы."}\n<a href="${data.digestUrl ?? `${baseUrl}/cabinet/practitioner`}">Открыть кабинет →</a>`;
    case "COMPLIANCE_ALERT":
      return `Комплаенс-сигнал\n${data.summary ?? "Нужна проверка модератором."}\n<a href="${data.reviewUrl ?? `${baseUrl}/admin/product/quality`}">Открыть →</a>`;
    case "CREDITS_EXPIRING":
      return `Баллы скоро сгорят\n${data.credits ?? "Несколько"} баллов закончатся примерно через ${data.days ?? "пару"} дн.\n<a href="${data.walletUrl ?? `${baseUrl}/cabinet/wallet`}">Открыть кошелёк →</a>`;
    case "STREAK_AT_RISK":
      return `Ритм практики\nЕсли сегодня есть силы, один короткий шаг сохранит ${data.streak ?? ""} дн.\n<a href="${data.practiceUrl ?? `${baseUrl}/cabinet/diary`}">Открыть практику →</a>`;
    case "MOMENT_OF_NEED":
      return `Можно вернуться к теме\n${data.topic ? `Тема: ${data.topic}.` : "Ваша карта все еще доступна."}\n<a href="${data.mapUrl ?? `${baseUrl}/cabinet/diary`}">Открыть карту →</a>`;
    case "WELCOME_CREDITS":
      return `Приветственные баллы начислены\n${data.credits ?? "3"} балла уже в кошельке.\n<a href="${data.walletUrl ?? `${baseUrl}/cabinet/wallet`}">Открыть кошелёк →</a>`;
    case "WELCOME_CREDITS_REMINDER":
      return `Приветственные баллы ждут\nМожно попробовать первый небольшой разбор без спешки.\n<a href="${data.walletUrl ?? `${baseUrl}/cabinet/wallet`}">Открыть кошелёк →</a>`;
    default:
      return `ETerapy: уведомление`;
  }
}
