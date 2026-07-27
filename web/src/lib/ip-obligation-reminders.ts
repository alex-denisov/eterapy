/**
 * B591 фаза 4 — напоминания об обязанностях ИП в Telegram.
 *
 * Запрос владельца дословно: «чтобы для меня не было сюрпризом». Календарь на
 * экране этого не закрывает: чтобы увидеть срок, надо зайти и посмотреть, то
 * есть вспомнить — а вспомнить и есть то, что не работает.
 *
 * Напоминание уходит за 10 и за 3 дня. Два срока, а не один: за десять дней
 * ещё можно собрать документы и спросить бухгалтера, за три — уже только
 * заплатить.
 *
 * ЧТО ЗДЕСЬ ЧИСТОЕ И ПОЧЕМУ. Выбор напоминаний и текст сообщения — чистые
 * функции: их проверяет прогон, а не боевая отправка. Со стороны базы остаётся
 * ровно два действия — найти получателей и отправить.
 */

import type { Obligation } from "@/lib/ip-accounting";
import { buildObligationSchedule } from "@/lib/ip-accounting";
import { log } from "@/lib/logger";
import { resolveOpsChannel } from "@/lib/ops-notification-channel";
import { sendTelegram } from "@/lib/telegram";

/** За сколько дней напоминаем. Десять — успеть подготовить, три — успеть заплатить. */
export const REMINDER_DAYS_BEFORE = [10, 3] as const;

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Разница в КАЛЕНДАРНЫХ днях по московскому времени.
 *
 * Не в миллисекундах: «за три дня» — это про дату в календаре владельца, а не
 * про 72 часа. Иначе джоб, запущенный в 23:30, посчитал бы завтрашний срок
 * сегодняшним.
 */
export function daysUntilMsk(dueAt: Date, now: Date): number {
  const dayOf = (date: Date) => Math.floor((date.getTime() + MSK_OFFSET_MS) / 86_400_000);
  return dayOf(dueAt) - dayOf(now);
}

export interface DueReminder {
  obligation: Obligation;
  daysLeft: number;
}

/**
 * Какие напоминания положены сегодня.
 *
 * Закрытые пункты пропускаются, просроченные — тоже: напоминать за 3 дня о
 * сроке, который прошёл, значит врать. Просрочка видна на экране красным, и
 * это другой разговор.
 */
export function dueReminders(obligations: readonly Obligation[], now: Date): DueReminder[] {
  const reminders: DueReminder[] = [];
  for (const obligation of obligations) {
    if (obligation.state === "done" || obligation.state === "overdue") continue;
    const daysLeft = daysUntilMsk(obligation.dueAt, now);
    if (!REMINDER_DAYS_BEFORE.includes(daysLeft as (typeof REMINDER_DAYS_BEFORE)[number])) continue;
    reminders.push({ obligation, daysLeft });
  }
  return reminders.sort((a, b) => a.daysLeft - b.daysLeft);
}

function formatDateMsk(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(date);
}

const RESPONSIBLE_LABELS: Record<Obligation["responsible"], string> = {
  owner: "делаете вы",
  accountant: "делает бухгалтер",
  platform: "делает платформа",
};

/**
 * Текст напоминания.
 *
 * Обязательно называет ответственного: половина сроков закрывается бухгалтером,
 * и напоминание без этой строки читается как «сделай сам» — то есть создаёт
 * ровно ту тревогу, ради снятия которой всё и строится.
 */
export function formatReminderMessage(reminder: DueReminder): string {
  const { obligation, daysLeft } = reminder;
  const daysWord = daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней";
  return [
    `<b>Срок ИП через ${daysLeft} ${daysWord}</b>`,
    "",
    `<b>${obligation.title}</b>`,
    `Куда: ${obligation.recipient}`,
    `Когда: ${formatDateMsk(obligation.dueAt)}`,
    `Кто: ${RESPONSIBLE_LABELS[obligation.responsible]}`,
    "",
    obligation.note,
  ].join("\n");
}

export interface ObligationReminderResult {
  ok: boolean;
  due: number;
  sent: number;
  recipients: number;
  failed: number;
  /** Куда ушло: служебный канал или запасной путь через личный Telegram. */
  target: "ops_channel" | "superadmin_fallback" | "none";
}

/**
 * Джоб напоминаний. Считает сроки текущего и следующего года — иначе в декабре
 * январские сроки не попадали бы в окно за 10 дней вовсе.
 */
export async function runIpObligationReminders(now: Date = new Date()): Promise<ObligationReminderResult> {
  const year = Number(
    new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone: "Europe/Moscow" }).format(now),
  );
  const schedule = [
    ...buildObligationSchedule(year, now),
    ...buildObligationSchedule(year + 1, now),
  ];
  const reminders = dueReminders(schedule, now);
  if (reminders.length === 0) {
    return { ok: true, due: 0, sent: 0, recipients: 0, failed: 0, target: "none" };
  }

  // Адрес доставки — служебный канал, а не личный Telegram суперадмина
  // (владелец 2026-07-27; подробности и запрет на «номер телефона» —
  // в `ops-notification-channel.ts`).
  const channel = await resolveOpsChannel();

  if (channel.chatIds.length === 0) {
    // Молчаливый успех здесь опаснее ошибки: «напоминания работают» при нулевой
    // доставке — это ровно тот сюрприз, который контур должен был убрать.
    log.warn("ip-obligation-reminders.no_recipients", { due: reminders.length });
    return { ok: false, due: reminders.length, sent: 0, recipients: 0, failed: 0, target: "none" };
  }

  let sent = 0;
  let failed = 0;
  for (const reminder of reminders) {
    const text = formatReminderMessage(reminder);
    for (const chatId of channel.chatIds) {
      try {
        await sendTelegram(chatId, text);
        sent += 1;
      } catch (error) {
        failed += 1;
        log.error("ip-obligation-reminders.send_failed", {
          target: channel.source,
          obligation: reminder.obligation.key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    ok: failed === 0,
    due: reminders.length,
    sent,
    recipients: channel.chatIds.length,
    failed,
    target: channel.source,
  };
}
