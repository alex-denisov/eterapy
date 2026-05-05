import type { Job } from "@prisma/client";
import { z } from "zod";
import db from "@/lib/db";
import { sendEmail } from "@/lib/email-send";
import { enqueueJob, type JobResult } from "@/lib/job-queue";
import { log, serializeError } from "@/lib/logger";
import { getTelegramRuntimeConfig, sendTelegram } from "@/lib/telegram";
import type { NotifEvent } from "@/lib/notification-events";

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
      return { title: "Новая запись", body: `${data.clientName} — ${data.date}, ${data.time}`, href: "/cabinet/practitioner/clients" };
    case "BOOKING_CONFIRMED":
      return { title: "Запись подтверждена", body: `${data.date} в ${data.time}`, href: data.sessionUrl ?? "/cabinet/bookings" };
    case "BOOKING_CANCELLED":
      return { title: "Запись отменена", body: `${data.date}${data.reason ? ` — ${data.reason}` : ""}`, href: "/cabinet/bookings" };
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
      return { title: "Запланированная выплата", body: `${data.date}: ${data.totalRub} ₽ (${data.practitionerCount})`, href: "/admin/payouts" };
    case "BALANCE_TOPUP":
      return { title: "Баланс пополнен", body: `+${data.amountRub} ₽`, href: "/cabinet/billing" };
    case "PRODUCT_UNLOCKED":
      return { title: "Продукт открыт", body: data.productKey, href: "/cabinet/billing" };
    case "SUBSCRIPTION_STARTED":
      return { title: "Подписка активна", body: `Тариф ${data.planKey}`, href: "/cabinet/billing" };
    case "SUBSCRIPTION_CANCELLED":
      return { title: "Подписка отменена", body: `Тариф ${data.planKey}`, href: "/cabinet/billing" };
    case "SUBSCRIPTION_PAYMENT_FAILED":
      return { title: "Платёж подписки не прошёл", body: `Тариф ${data.planKey}`, href: "/cabinet/billing" };
    case "CARD_LINKED":
      return { title: "Карта привязана", body: `${data.brand} •••• ${data.last4}`, href: "/cabinet/billing" };
    case "CARD_REMOVED":
      return { title: "Карта отвязана", body: `${data.brand} •••• ${data.last4}`, href: "/cabinet/billing" };
    default:
      return { title: "Уведомление", body: "" };
  }
}

function formatTelegramMessage(event: NotifEvent, name: string, data: Record<string, string>): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
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
    case "SUBSCRIPTION_CANCELLED":
      return `Подписка отменена\nТариф ${data.planKey}. Подробности доступны в биллинге.\n<a href="${baseUrl}/cabinet/billing">Открыть биллинг →</a>`;
    case "SUBSCRIPTION_PAYMENT_FAILED":
      return `Платёж подписки не прошёл\nТариф ${data.planKey} требует внимания.\n<a href="${baseUrl}/cabinet/billing">Проверить оплату →</a>`;
    case "CARD_LINKED":
      return `🔗 Карта привязана\n${data.brand} •••• ${data.last4} теперь доступна для быстрой оплаты.`;
    case "CARD_REMOVED":
      return `🗑 Карта отвязана\n${data.brand} •••• ${data.last4} удалена из списка карт.`;
    default:
      return `ETerapy: уведомление`;
  }
}
