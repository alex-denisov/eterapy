/**
 * B599 · Гейты маркетинговой отправки.
 *
 * Всё здесь — ЧИСТЫЕ функции, и это осознанно: единственный способ доказать, что
 * человеку в кризисе реклама не уйдёт, — прогон, а не договорённость. Гейт,
 * живущий внутри асинхронного отправителя вперемешку с запросами в базу,
 * проверить нечем.
 *
 * Порядок гейтов не косметический. Сначала то, что запрещает отправку НАВСЕГДА
 * (выключатель, кризис, отписка, отсутствие согласия), потом то, что её
 * ОТКЛАДЫВАЕТ (ночь, частота). Причина отказа возвращается наружу и попадает в
 * журнал: «не ушло» без причины — это то же молчание, из-за которого полгода
 * не замечали неработающий cron.
 */

import type { MarketingEventSpec } from "@/lib/marketing/events";

export type MarketingBlockReason =
  | "feature_disabled"
  | "crisis_guard"
  | "opted_out"
  | "no_consent"
  | "quiet_hours"
  | "weekly_cap"
  | "event_cooldown";

export type MarketingDecision =
  | { allowed: true }
  | { allowed: false; reason: MarketingBlockReason; retryAfter?: Date };

/** Стартовый потолок из тикета: не больше двух касаний в неделю НА ВСЕ каналы. */
export const WEEKLY_TOUCH_CAP = 2;

/** Ночное окно по домашнему часовому поясу человека. */
export const QUIET_HOURS = { fromHour: 23, toHour: 6 } as const;

export interface MarketingRecipientState {
  /** Когда получено согласие именно на маркетинг. `null` — не получено. */
  marketingConsentAt: Date | null;
  /** Отписка. Побеждает согласие всегда, даже если она раньше по времени. */
  marketingOptOutAt: Date | null;
  /** Признак кризиса из последнего диалога (sensitive / crisis / blocked). */
  crisisGuard: boolean;
  /** Смещение домашнего пояса в минутах от UTC. МСК = 180. */
  timezoneOffsetMinutes: number;
  /** Сколько маркетинговых сообщений ушло за последние 7 суток. */
  touchesLast7Days: number;
  /** Когда это же событие уходило этому человеку в последний раз. */
  lastSentForEventAt: Date | null;
}

/**
 * Час по домашнему поясу получателя.
 *
 * Считаем через смещение, а не через `toLocaleString`: ночь — это про часы на
 * стене у человека, и подмена его пояса серверным рассылала бы письма в три
 * ночи ровно тем, кто дальше от Москвы.
 */
export function localHour(now: Date, timezoneOffsetMinutes: number): number {
  const shifted = new Date(now.getTime() + timezoneOffsetMinutes * 60_000);
  return shifted.getUTCHours();
}

export function isQuietHour(now: Date, timezoneOffsetMinutes: number): boolean {
  const hour = localHour(now, timezoneOffsetMinutes);
  // Окно переходит через полночь, поэтому условие ИЛИ, а не диапазон.
  return hour >= QUIET_HOURS.fromHour || hour < QUIET_HOURS.toHour;
}

const DAY_MS = 86_400_000;

/**
 * Можно ли отправить прямо сейчас.
 *
 * `featureEnabled` приходит снаружи, а не читается из `process.env` здесь:
 * иначе выключатель нельзя было бы проверить прогоном, а он — последнее, что
 * стоит между черновиком матрицы и реальными людьми.
 */
export function marketingDecision(input: {
  featureEnabled: boolean;
  event: Pick<MarketingEventSpec, "minDaysBetween">;
  recipient: MarketingRecipientState;
  now: Date;
}): MarketingDecision {
  const { featureEnabled, event, recipient, now } = input;

  if (!featureEnabled) return { allowed: false, reason: "feature_disabled" };

  // Кризис проверяется ДО согласия. Человек в кризисе мог согласие дать —
  // это ничего не меняет: продавать ему в этот момент нельзя.
  if (recipient.crisisGuard) return { allowed: false, reason: "crisis_guard" };

  if (recipient.marketingOptOutAt) return { allowed: false, reason: "opted_out" };
  if (!recipient.marketingConsentAt) return { allowed: false, reason: "no_consent" };

  if (recipient.touchesLast7Days >= WEEKLY_TOUCH_CAP) {
    return { allowed: false, reason: "weekly_cap" };
  }

  if (recipient.lastSentForEventAt) {
    const readyAt = new Date(recipient.lastSentForEventAt.getTime() + event.minDaysBetween * DAY_MS);
    if (readyAt > now) return { allowed: false, reason: "event_cooldown", retryAfter: readyAt };
  }

  if (isQuietHour(now, recipient.timezoneOffsetMinutes)) {
    return { allowed: false, reason: "quiet_hours", retryAfter: nextMorning(now, recipient.timezoneOffsetMinutes) };
  }

  return { allowed: true };
}

/** Ближайшие 06:00 по поясу получателя — когда отложенное можно повторить. */
export function nextMorning(now: Date, timezoneOffsetMinutes: number): Date {
  const shifted = new Date(now.getTime() + timezoneOffsetMinutes * 60_000);
  const morning = new Date(shifted);
  morning.setUTCHours(QUIET_HOURS.toHour, 0, 0, 0);
  if (morning <= shifted) morning.setUTCDate(morning.getUTCDate() + 1);
  return new Date(morning.getTime() - timezoneOffsetMinutes * 60_000);
}

export const MARKETING_BLOCK_LABELS: Record<MarketingBlockReason, string> = {
  feature_disabled: "Рассылка выключена",
  crisis_guard: "Кризисный гейт",
  opted_out: "Отписался",
  no_consent: "Нет согласия",
  quiet_hours: "Ночное окно",
  weekly_cap: "Потолок касаний за неделю",
  event_cooldown: "Слишком рано для этого события",
};
