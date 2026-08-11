/**
 * B700 фаза 5 — определения очередей конвейера в ОДНОМ месте.
 *
 * Сводка конвейера обязана показывать ровно те числа, по которым линия
 * принимает решения. Если бы панель считала спрос своим запросом, она рано или
 * поздно разошлась бы с проходом — и владелец чинил бы не то узкое место,
 * которое действительно связывает линию. Поэтому условия выборок живут здесь, а
 * и проход (`agent.ts`), и сводка (`conveyor-snapshot.ts`) берут их отсюда.
 *
 * Модуль намеренно не знает ни базы, ни дат: он возвращает описания условий
 * Prisma. Всё измеримое приходит аргументами — то же правило, что у
 * `conveyor-tact.ts`.
 */

import { Prisma } from "@prisma/client";
import { CONVERSATIONAL_CONTENT_TYPES } from "@/lib/marketing/perimeter";

/**
 * Материал в работе: плановый черновик, ещё не прошедший редактора, либо
 * разговорный ответ, которому редактор вернул правку.
 */
export const readyForWorkFilter = {
  OR: [
    { status: "DRAFT", agentReviewedAt: null },
    {
      status: "REVIEW",
      contentType: { in: [...CONVERSATIONAL_CONTENT_TYPES] },
      lastError: "REVISION_REQUESTED",
    },
  ],
};

export const conversationalFilter = { contentType: { in: [...CONVERSATIONAL_CONTENT_TYPES] } };
export const plannedFilter = { NOT: conversationalFilter };

/**
 * Написано, но ещё не проверено — очередь барабана.
 *
 * Спрашивается СКЛАД (`agentWriterDraft`), а не отметка времени: частичный
 * индекс фазы 1 построен ровно по этой паре условий, и из
 * `agent_written_at IS NOT NULL` наличие склада не следует.
 */
export const awaitingReviewFilter = {
  agentWriterDraft: { not: Prisma.DbNull },
  agentReviewedAt: null,
};

/** Материал без плановой даты ждать нечего — он идёт в этот же проход. */
export function dueNowFilter(horizon: Date) {
  return { OR: [{ scheduledFor: null }, { scheduledFor: { lte: horizon } }] };
}
