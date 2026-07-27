/**
 * Куда платформа пишет служебные (не пользовательские) уведомления.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Бухгалтерские напоминания B591 первоначально уходили
 * в личный Telegram суперадмина. Владелец 2026-07-27: личный аккаунт занят под
 * проверку мини-аппа, привязывать его к суперадмину неудобно, а один Telegram
 * нельзя держать на двух аккаунтах сразу (INC-088). Значит адрес служебной
 * доставки не должен зависеть от того, чей аккаунт сейчас привязан.
 *
 * ⚠ ПОЧЕМУ НЕ НОМЕР ТЕЛЕФОНА. Ссылка вида `t.me/+79651936059` — это приглашение
 * в личную переписку, а не адрес для бота. Bot API умеет писать только в
 * `chat_id`, который появляется ПОСЛЕ того, как собеседник сам нажал Start у
 * бота (или бота добавили в группу/канал). Номера телефона в Bot API нет
 * вовсе — метода «написать по номеру» не существует, и обойти это нельзя.
 * Поэтому служебный адрес — канал, тот же, куда падают уведомления о деплое.
 *
 * ⚠ ПРО «у пользователя может не быть telegramID». `users.telegramId` у нас —
 * это ЧИСЛОВОЙ chat_id, который Telegram выдаёт каждому аккаунту сам. Это не
 * @username: имени пользователя действительно может не быть, и на доставку это
 * не влияет. Пользовательские уведомления от этого не ломаются.
 */

import { db } from "@/lib/db";

/** Откуда взялся адрес — нужно в логах и в диагностике админки. */
export type OpsChannelSource = "ops_channel" | "superadmin_fallback" | "none";

export interface OpsChannelTarget {
  chatIds: string[];
  source: OpsChannelSource;
}

/**
 * Явный адрес служебной доставки, если он задан конфигурацией.
 *
 * `OPS_NOTIFY_CHAT_ID` — на случай, когда бухгалтерию захочется увести из
 * шумного деплой-канала в отдельный. Пока не задан, работает `TELEGRAM_CHAT_ID`
 * — тот самый канал, куда пишет пайплайн выкатки.
 */
export function configuredOpsChatId(env: Partial<NodeJS.ProcessEnv> = process.env): string | null {
  const explicit = env.OPS_NOTIFY_CHAT_ID?.trim();
  if (explicit) return explicit;
  const deployChannel = env.TELEGRAM_CHAT_ID?.trim();
  if (deployChannel) return deployChannel;
  return null;
}

/**
 * Кому слать служебное уведомление.
 *
 * Канал — основной адрес. Личный Telegram суперадминов остаётся ТОЛЬКО
 * запасным путём на случай, когда канал не настроен вовсе: молчаливая нулевая
 * доставка для напоминаний о налоговых сроках хуже, чем сообщение не туда.
 */
export async function resolveOpsChannel(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): Promise<OpsChannelTarget> {
  const chatId = configuredOpsChatId(env);
  if (chatId) return { chatIds: [chatId], source: "ops_channel" };

  const superadmins = await db.user.findMany({
    where: { role: "SUPERADMIN", telegramId: { not: null } },
    select: { telegramId: true },
  });
  const chatIds = superadmins
    .map((user) => user.telegramId)
    .filter((id): id is string => Boolean(id));

  if (chatIds.length === 0) return { chatIds: [], source: "none" };
  return { chatIds, source: "superadmin_fallback" };
}
