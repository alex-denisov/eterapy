/**
 * B653 · Карточка «вышло» в маркетинговый канал.
 *
 * ⚠ ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. До этого владелец видел только премодерацию —
 * карточку ДО выпуска и только для разговорных типов. Факт публикации наружу не
 * выходил вовсе: он жил в `external_publications.status` и в логе. То есть
 * работающий контур и молчащий контур выглядели одинаково — ровно та
 * неразличимость, которая дала INC-063 (полгода не работавший cron).
 *
 * Текст карточки собирается ЧИСТОЙ функцией: содержимое проверяется прогоном,
 * а не живой отправкой в Telegram.
 */

import { log } from "@/lib/logger";
import { sendTelegram } from "@/lib/telegram";
import { marketingDeliveryTargets } from "@/lib/ops-notification-channel";
import { engagementToneById } from "@/lib/marketing/engagement-tone";
import { INBOUND_REPLY_CONTENT_TYPE } from "@/lib/marketing/perimeter";

export interface PublishedNotificationInput {
  platform: string;
  channelName: string | null;
  contentType: string;
  title: string;
  body: string | null;
  /** Публичный адрес. Пусто у площадок, которые забирают материал сами. */
  publicUrl: string | null;
  /** Куда ведёт материал на нашей стороне — посадочная страница. */
  destinationUrl: string | null;
  /** Тема/рубрика контент-плана. */
  cluster: string | null;
  /** Запрос, под который написан материал. */
  targetQuery: string | null;
  engagementTargetLabel: string | null;
  engagementTargetUrl: string | null;
  engagementExcerpt: string | null;
  engagementTone: string | null;
  publishedAt: Date;
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function short(value: string | null | undefined, limit: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

/** Человеческое имя типа материала. Внутренний код владельцу ничего не говорит. */
export function publicationKindLabel(contentType: string): string {
  if (contentType === INBOUND_REPLY_CONTENT_TYPE) return "Ответ на входящее";
  if (contentType === "COMMENT") return "Комментарий";
  if (contentType === "POST") return "Пост";
  return contentType;
}

/**
 * Почему у материала нет ссылки.
 *
 * ⚠ Пустая строка вместо адреса читается как поломка. У Дзена адреса нет
 * BY DESIGN: площадка забирает материал лентой и присваивает адрес сама уже
 * после импорта (B620). Придумывать адрес нельзя, молчать — тоже.
 */
export function missingUrlReason(platform: string): string {
  if (platform.toLowerCase() === "dzen") {
    return "адрес появится после того, как Дзен заберёт материал из ленты";
  }
  return "площадка не вернула адрес материала";
}

/**
 * Текст карточки. Ёмко: один экран, без кнопок — это отчёт о свершившемся,
 * а не решение, которое надо принять.
 */
export function buildPublishedNotification(input: PublishedNotificationInput): string {
  const isReply = input.contentType === INBOUND_REPLY_CONTENT_TYPE;
  const isConversational = isReply || input.contentType === "COMMENT";

  const when = input.publishedAt.toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  });

  const where = short(input.channelName, 120);
  const tone = engagementToneById(input.engagementTone)?.label ?? null;
  const target = short(input.engagementTargetLabel, 180);
  const excerpt = short(input.engagementExcerpt, 400);
  const preview = short(input.body, 600);

  const lines: string[] = [
    `<b>Опубликовано: ${html(publicationKindLabel(input.contentType))}</b>`,
    "",
    `<b>Площадка:</b> ${html(input.platform)}${where ? ` · ${html(where)}` : ""}`,
    `<b>Когда:</b> ${html(when)} МСК`,
  ];

  if (input.cluster) lines.push(`<b>Тема:</b> ${html(input.cluster)}`);
  if (input.targetQuery) lines.push(`<b>Запрос:</b> ${html(input.targetQuery)}`);
  if (isConversational && tone) lines.push(`<b>Регистр:</b> ${html(tone)}`);

  if (isConversational) {
    lines.push(`<b>${isReply ? "Кому ответили" : "Где прокомментировали"}:</b> ${html(target ?? "—")}`);
    if (excerpt) {
      lines.push(`<b>${isReply ? "Нам написали" : "Контекст"}:</b> ${html(excerpt)}`);
    }
  }

  lines.push(
    input.publicUrl
      ? `<b>Ссылка:</b> ${html(input.publicUrl)}`
      : `<b>Ссылка:</b> пока нет — ${html(missingUrlReason(input.platform))}`,
  );

  if (isConversational && input.engagementTargetUrl && input.engagementTargetUrl !== input.publicUrl) {
    lines.push(`<b>Исходное обсуждение:</b> ${html(input.engagementTargetUrl)}`);
  }
  if (input.destinationUrl) {
    lines.push(`<b>Ведёт на:</b> ${html(input.destinationUrl)}`);
  }

  if (!isConversational) {
    const title = short(input.title, 200);
    if (title) lines.push("", `<b>${html(title)}</b>`);
  }
  if (preview) lines.push("", html(preview));

  return lines.join("\n");
}

/**
 * Доставка карточки.
 *
 * ⚠ НИКОГДА НЕ БРОСАЕТ. Материал к этому моменту УЖЕ на площадке. Исключение из
 * Telegram не имеет права ни откатить публикацию, ни перевести строку в
 * `FAILED` — иначе недоставленное уведомление превращалось бы в ложный отказ
 * выпуска (тот же класс ошибки, что и в B640 с гейтом деплой-бота).
 */
export async function notifyPublished(input: PublishedNotificationInput): Promise<boolean> {
  let targets: string[] = [];
  try {
    targets = await marketingDeliveryTargets();
  } catch (error) {
    log.error("marketing.publish_notify_targets_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  const message = buildPublishedNotification(input);
  for (const chatId of targets) {
    try {
      await sendTelegram(chatId, message);
      return true;
    } catch (error) {
      log.warn("marketing.publish_notify_failed", {
        chatId,
        platform: input.platform,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  log.error("marketing.publish_notify_undelivered", {
    platform: input.platform,
    targets: targets.length,
  });
  return false;
}
