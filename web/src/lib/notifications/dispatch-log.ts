/**
 * B599 (батч №20) · Запись служебной отправки в журнал.
 *
 * ⚠ ЗАПИСЬ НЕ ИМЕЕТ ПРАВА СОРВАТЬ ДОСТАВКУ. Журнал — наблюдение, а не часть
 * отправки: если запись падает, письмо всё равно ушло, и превращать это в
 * повторную попытку доставки значило бы слать человеку второе такое же письмо
 * из-за проблемы в нашей бухгалтерии. Отсюда `catch` внутри, а не снаружи.
 *
 * ⚠ ТЕЛО АККАУНТНЫХ ПИСЕМ НЕ СОХРАНЯЕТСЯ. В письме сброса пароля лежит рабочая
 * одноразовая ссылка. Журнал читает суперадмин — сохранённое тело означало бы,
 * что доступ к админке даёт вход в любой аккаунт. Тема, адресат и время
 * сохраняются: их достаточно, чтобы ответить на вопрос «письмо уходило?».
 */

import { db } from "@/lib/db";
import { log } from "@/lib/logger";

export type DispatchKind = "notify" | "account";

export interface RecordDispatchInput {
  userId?: string | null;
  recipient: string;
  event: string;
  kind: DispatchKind;
  channel: "EMAIL" | "TELEGRAM" | "WEB";
  status: "sent" | "failed";
  subject?: string | null;
  body?: string | null;
  error?: string | null;
}

export async function recordNotificationDispatch(input: RecordDispatchInput): Promise<void> {
  try {
    await db.notificationDispatch.create({
      data: {
        userId: input.userId ?? null,
        recipient: input.recipient,
        event: input.event,
        kind: input.kind,
        channel: input.channel,
        status: input.status,
        subject: input.subject ?? null,
        // Тело аккаунтных писем не хранится ни при каких условиях — см. шапку.
        body: input.kind === "account" ? null : (input.body ?? null),
        error: input.error ?? null,
      },
    });
  } catch (error) {
    log.error("notification.dispatch_log_failed", {
      event: input.event,
      channel: input.channel,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Аккаунтное письмо: обёртка вокруг отправителя из `lib/email.ts`.
 *
 * Оборачивать, а не звать журнал рядом с каждым вызовом: рядом — значит в
 * семи местах, и восьмое забудут. Ошибка отправки пробрасывается дальше в
 * неизменном виде — решение, что с ней делать, принимает вызывающий.
 */
export async function withAccountEmailLog<T>(
  input: { userId?: string | null; recipient: string; event: string; subject: string },
  send: () => Promise<T>,
): Promise<T> {
  try {
    const result = await send();
    await recordNotificationDispatch({
      userId: input.userId,
      recipient: input.recipient,
      event: input.event,
      kind: "account",
      channel: "EMAIL",
      status: "sent",
      subject: input.subject,
    });
    return result;
  } catch (error) {
    await recordNotificationDispatch({
      userId: input.userId,
      recipient: input.recipient,
      event: input.event,
      kind: "account",
      channel: "EMAIL",
      status: "failed",
      subject: input.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
