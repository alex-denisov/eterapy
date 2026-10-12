/**
 * B764 — кнопки поста Threads, которые не решают судьбу поста сами: оценка 1–10
 * (`smr`) и теги причин отказа (`smt`). Решения «Публиковать»/«Доработать»/
 * «Отказать» живут в `moderation.ts`; здесь только то, что их дополняет.
 */

import db from "@/lib/db";
import { log } from "@/lib/logger";
import {
  parseThreadsCallback,
  rejectTagsKeyboard,
  threadsCardKeyboard,
} from "@/lib/marketing/moderation";
import { reworkThreadsPost } from "@/lib/marketing/owner-review";
import { moderationChatIds } from "@/lib/ops-notification-channel";
import { callTelegramApi } from "@/lib/telegram";
import {
  REJECT_TAGS,
  isRejectTagIndex,
  putPending,
  setOwnerRating,
  readPending,
  toggleTag,
} from "@/lib/marketing/threads-verdicts";

interface ThreadsCallbackInput {
  data: string;
  chatId: string;
  callbackQueryId: string;
  messageId?: number;
  now?: Date;
}

async function answer(callbackQueryId: string, text: string): Promise<void> {
  await callTelegramApi("answerCallbackQuery", { callback_query_id: callbackQueryId, text }).catch(() => undefined);
}

/** `null` — это не кнопка поста Threads; иначе результат для журнала webhook. */
export async function handleThreadsCallback(input: ThreadsCallbackInput): Promise<{ result: string } | null> {
  const parsed = parseThreadsCallback(input.data);
  if (!parsed) return null;
  if (!(await moderationChatIds()).includes(input.chatId)) {
    throw new Error("Threads callback came from a chat we do not moderate from");
  }
  const now = input.now ?? new Date();
  const row = await db.externalPublication.findUnique({ where: { id: parsed.publicationId } });
  if (!row || row.status !== "REVIEW") {
    await answer(input.callbackQueryId, "Решение по этому посту уже принято.");
    return { result: "threads-callback-stale" };
  }

  if (parsed.prefix === "smr") {
    const rating = Number(parsed.arg);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) return { result: "threads-rating-invalid" };
    await setOwnerRating(row.id, rating);
    if (input.messageId) {
      await callTelegramApi("editMessageReplyMarkup", {
        chat_id: input.chatId,
        message_id: input.messageId,
        reply_markup: threadsCardKeyboard(row.id, rating),
      }).catch(() => undefined);
    }
    await answer(input.callbackQueryId, `Оценка ${rating} сохранена. Решение — кнопками выше.`);
    return { result: "threads-rated" };
  }

  const pending = (await readPending(now)).find((entry) => entry.publicationId === row.id && entry.action === "reject");
  if (!pending) {
    await answer(input.callbackQueryId, "Сначала нажмите «Отказать» на карточке.");
    return { result: "threads-tag-no-pending" };
  }

  if (parsed.arg === "go") {
    const reply = await reworkThreadsPost({ entry: pending, comment: null, now });
    await answer(input.callbackQueryId, reply ? "Отказ принят: пишу заново." : "Отказ уже обработан.");
    if (input.messageId) {
      await callTelegramApi("editMessageReplyMarkup", {
        chat_id: input.chatId,
        message_id: input.messageId,
        reply_markup: { inline_keyboard: [] },
      }).catch(() => undefined);
    }
    return { result: "threads-reject-sent" };
  }

  const index = Number(parsed.arg);
  if (!isRejectTagIndex(index)) return { result: "threads-tag-invalid" };
  const tags = toggleTag(pending.tags, REJECT_TAGS[index].id);
  await putPending({ ...pending, tags }, now);
  if (input.messageId) {
    await callTelegramApi("editMessageReplyMarkup", {
      chat_id: input.chatId,
      message_id: input.messageId,
      reply_markup: rejectTagsKeyboard(row.id, tags),
    }).catch((error) => log.warn("threads-owner-flow.tag_edit_failed", {
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  await answer(input.callbackQueryId, tags.length > 0 ? "Причины обновлены." : "Причин не выбрано.");
  return { result: "threads-tag-toggled" };
}
