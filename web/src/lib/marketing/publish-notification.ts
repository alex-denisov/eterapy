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

const PLATFORM_LABEL: Record<string, string> = {
  threads: "Threads", telegram: "Telegram", dzen: "Дзен", vk: "VK", instagram: "Instagram", max: "MAX",
};

function platformLabel(platform: string): string {
  return PLATFORM_LABEL[platform.trim().toLowerCase()] ?? platform;
}

/**
 * Текст карточки (B765). Это отчёт о свершившемся, а не решение: текст поста не
 * повторяется (он виден в соседнем канале), полей «Тема», «Запрос», «Ведёт на»
 * и второго заголовка нет — владелец назвал их лишними, а аудит показал, что
 * читает их только эта карточка.
 *
 * Свой пост — одна строка: `Threads · 14:20 · опубликовано · ссылка`. Разговор
 * (ответ на входящее, комментарий) сохраняет «кому» и «что», потому что без них
 * карточка ничего не говорит.
 */
export function buildPublishedNotification(input: PublishedNotificationInput): string {
  const isReply = input.contentType === INBOUND_REPLY_CONTENT_TYPE;
  const isConversational = isReply || input.contentType === "COMMENT";

  const time = input.publishedAt.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
  const link = input.publicUrl
    ? html(input.publicUrl)
    : `ссылки пока нет — ${html(missingUrlReason(input.platform))}`;
  const head = `${html(platformLabel(input.platform))} · ${time} · опубликовано`;

  if (!isConversational) return `${head} · ${link}`;

  const lines: string[] = [`<b>${head}: ${html(publicationKindLabel(input.contentType))}</b>`];
  const tone = engagementToneById(input.engagementTone)?.label ?? null;
  if (tone) lines.push(`<b>Регистр:</b> ${html(tone)}`);
  lines.push(`<b>${isReply ? "Кому ответили" : "Где прокомментировали"}:</b> ${html(short(input.engagementTargetLabel, 180) ?? "—")}`);
  const excerpt = short(input.engagementExcerpt, 300);
  if (excerpt) lines.push(`<b>${isReply ? "Нам написали" : "Контекст"}:</b> ${html(excerpt)}`);
  const reply = short(input.body, 400);
  if (reply) lines.push(`<b>Что ответили:</b> ${html(reply)}`);
  lines.push(`<b>Ссылка:</b> ${link}`);
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
