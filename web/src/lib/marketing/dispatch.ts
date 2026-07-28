/**
 * B599 · Отправка маркетингового сообщения.
 *
 * Единственная дверь наружу. Всё, что решает «слать или не слать», живёт в
 * `gates.ts` и проверено прогоном; здесь — только сбор состояния получателя,
 * подстановка в текст и запись в журнал.
 *
 * ⚠ ЗАПИСЬ В ЖУРНАЛ ИДЁТ ВСЕГДА, включая отказ. Иначе «ничего не ушло»
 * невозможно отличить от «механизм не работает» — ровно так полгода не замечали
 * не запускавшийся cron (INC-063).
 */

import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { findMarketingEvent, type MarketingChannel } from "@/lib/marketing/events";
import { marketingDecision, type MarketingRecipientState } from "@/lib/marketing/gates";
import { unsubscribeUrl, withUnsubscribeFooter } from "@/lib/marketing/unsubscribe";
import { absoluteMainUrl } from "@/lib/subdomain";
import { sendMarketingEmail } from "@/lib/email-send";
import { sendTelegram } from "@/lib/telegram";

/**
 * Выключатель. По умолчанию ВЫКЛЮЧЕН: матрица едет на прод раньше, чем владелец
 * её принял, и включаться сама она не должна.
 */
export function marketingNotificationsEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.MARKETING_NOTIFICATIONS === "1" || env.MARKETING_NOTIFICATIONS === "true";
}

const WEEK_MS = 7 * 86_400_000;

/** Подстановка значений в шаблон. Незаполненный плейсхолдер остаётся как есть — видно в журнале. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * Смещение домашнего пояса в минутах. Без пояса считаем МСК: подавляющее
 * большинство аудитории в нём, и ошибка в сторону Москвы даёт письмо не в три
 * ночи, а вечером.
 */
export function timezoneOffsetMinutes(timezone: string | null | undefined, now: Date): number {
  if (!timezone) return 180;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
      day: "2-digit",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
    let diff = (hour - now.getUTCHours()) * 60;
    if (day !== now.getUTCDate()) diff += day > now.getUTCDate() ? 1440 : -1440;
    return diff;
  } catch {
    return 180;
  }
}

async function recipientState(userId: string, eventKey: string, now: Date): Promise<MarketingRecipientState | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      marketingConsentAt: true,
      marketingOptOutAt: true,
      timezone: true,
    },
  });
  if (!user) return null;

  const [touchesLast7Days, lastForEvent, latestDialogue] = await Promise.all([
    db.marketingDispatch.count({
      where: { userId, status: "sent", sentAt: { gte: new Date(now.getTime() - WEEK_MS) } },
    }),
    db.marketingDispatch.findFirst({
      where: { userId, eventKey, status: "sent" },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
    // Кризис берём из последнего диалога — тот же признак, по которому кабинет
    // прячет продажи (`cabinet/page.tsx`). Два разных определения кризиса на
    // платформе означали бы, что где-то он не сработает.
    db.dialogue.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { safetyLevel: true },
    }),
  ]);

  return {
    marketingConsentAt: user.marketingConsentAt,
    marketingOptOutAt: user.marketingOptOutAt,
    crisisGuard: ["sensitive", "crisis", "blocked"].includes(latestDialogue?.safetyLevel ?? ""),
    timezoneOffsetMinutes: timezoneOffsetMinutes(user.timezone, now),
    touchesLast7Days,
    lastSentForEventAt: lastForEvent?.sentAt ?? null,
  };
}

type MarketingDeliveryRecipient = {
  email: string;
  name: string;
  telegramId: string | null;
};

async function deliveryRecipient(userId: string): Promise<MarketingDeliveryRecipient | null> {
  return db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, telegramId: true },
  });
}

function bestChannel(
  channels: readonly MarketingChannel[],
  recipient: MarketingDeliveryRecipient | null,
): MarketingChannel {
  return channels.find((channel) =>
    channel === "push"
    || (channel === "telegram" && Boolean(recipient?.telegramId))
    || (channel === "email" && Boolean(recipient?.email))
  ) ?? channels[0];
}

function escapeTelegram(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function deliverMarketing(input: {
  userId: string;
  channel: MarketingChannel;
  recipient: MarketingDeliveryRecipient | null;
  subject: string;
  body: string;
}): Promise<{ body: string }> {
  if (!input.recipient) throw new Error("Marketing recipient not found");
  if (input.channel === "email") {
    const sent = await sendMarketingEmail({
      to: input.recipient.email,
      subject: input.subject,
      body: input.body,
    });
    if (!sent.delivered) throw new Error("Email provider did not confirm delivery");
    return { body: sent.html };
  }
  if (input.channel === "telegram") {
    if (!input.recipient.telegramId) throw new Error("Telegram is not linked");
    const rendered = `<b>${escapeTelegram(input.subject)}</b>\n\n${escapeTelegram(input.body)}`;
    await sendTelegram(input.recipient.telegramId, rendered);
    return { body: rendered };
  }
  await db.notification.create({
    data: {
      userId: input.userId,
      event: "MOMENT_OF_NEED",
      title: input.subject,
      body: input.body,
      href: "/cabinet",
    },
  });
  return { body: input.body };
}

export interface SendMarketingInput {
  userId: string;
  eventKey: string;
  /** Значения для плейсхолдеров: `{name}`, `{points}`, `{service}`, `{cta}` и т. п. */
  values: Record<string, string>;
  now?: Date;
  /** Реальная доставка. Отдельным параметром, чтобы прогон не слал ничего наружу. */
  deliver?: (channel: MarketingChannel, subject: string, body: string) => Promise<void>;
}

export interface SendMarketingResult {
  status: "sent" | "blocked" | "failed";
  reason?: string;
}

export async function sendMarketingMessage(input: SendMarketingInput): Promise<SendMarketingResult> {
  const now = input.now ?? new Date();
  const event = findMarketingEvent(input.eventKey);
  if (!event) {
    log.error("marketing.unknown_event", { eventKey: input.eventKey });
    return { status: "failed", reason: "unknown_event" };
  }

  const recipient = await recipientState(input.userId, event.key, now);
  if (!recipient) return { status: "failed", reason: "unknown_user" };

  const decision = marketingDecision({
    featureEnabled: marketingNotificationsEnabled(),
    event,
    recipient,
    now,
  });

  const recipientDelivery = await deliveryRecipient(input.userId);
  const channel = bestChannel(event.channels, recipientDelivery);

  if (!decision.allowed) {
    await db.marketingDispatch.create({
      data: {
        userId: input.userId,
        eventKey: event.key,
        category: event.category,
        channel,
        status: "blocked",
        blockedBy: decision.reason,
      },
    });
    return { status: "blocked", reason: decision.reason };
  }

  const subject = renderTemplate(event.subject, input.values);
  // Ссылку отписки клеит отправитель, а не шаблон: шаблон без неё — это письмо,
  // которое уйдёт без неё, и заметят это снаружи, а не у нас. В журнал тело
  // попадает уже со ссылкой — снимок должен совпадать с отправленным.
  const body = withUnsubscribeFooter(
    renderTemplate(event.body, input.values),
    unsubscribeUrl(input.userId, absoluteMainUrl("")),
  );

  try {
    const delivered = input.deliver
      ? (await input.deliver(channel, subject, body), { body })
      : await deliverMarketing({
        userId: input.userId,
        channel,
        recipient: recipientDelivery,
        subject,
        body,
      });
    await db.marketingDispatch.create({
      data: {
        userId: input.userId,
        eventKey: event.key,
        category: event.category,
        channel,
        status: "sent",
        subject,
        body: delivered.body,
        sentAt: now,
      },
    });
    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.marketingDispatch.create({
      data: {
        userId: input.userId,
        eventKey: event.key,
        category: event.category,
        channel,
        status: "failed",
        subject,
        body,
        error: message,
      },
    });
    log.error("marketing.send_failed", { eventKey: event.key, error: message });
    return { status: "failed", reason: message };
  }
}
