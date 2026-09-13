/**
 * B713 §6 — просроченная строка перестаёт перебираться вечно.
 *
 * ЖИВОЙ СЛУЧАЙ. Строка неподключённой площадки со слотом 2026-08-10 в статусе
 * SCHEDULED перебиралась публикатором КАЖДУЮ МИНУТУ и каждую минуту отбивалась
 * «коннектор не настроен». К 17.08 это неделя одинаковых строк в журнале —
 * фон, в котором тонет всё остальное.
 *
 * Почему её не убрал ни один из существующих сторожей:
 *
 *   `beyond`   ловит дату ДАЛЬШЕ горизонта, а эта в ПРОШЛОМ;
 *   `noDate`   ловит пустую дату, а эта заполнена;
 *   `slotGone` не сработал: слот площадки в плане ещё числился;
 *   B645       переносит закрывшееся окно, но строка не доходит до переноса —
 *              её канал на паузе, и проход прекращается раньше.
 *
 * То есть у «просроченного» не было СВОЕГО правила, и он проваливался между
 * четырьмя чужими. Правило заведено отдельным, а не расширением соседнего:
 * «дата в будущем дальше горизонта» и «дата давно в прошлом» — разные болезни
 * с разным лечением.
 *
 * ⚠ ГРАНИЦА ШИРОКАЯ НАМЕРЕННО. Двое суток, а не два часа: у статьи Дзена окно
 * шесть часов, а перенос B645 работает внутри суток. Узкий порог отбирал бы
 * материал у штатного механизма переноса, который справляется сам.
 */

import { planQueueHygiene } from "@/lib/marketing/queue-hygiene";
import { contentPlanFor } from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-17T12:00:00Z");

function row(over: Record<string, unknown> = {}) {
  return {
    id: "stale-threads",
    platform: "threads",
    status: "SCHEDULED",
    contentType: "POST",
    scheduledFor: new Date("2026-08-10T14:00:00Z"),
    publishedAt: null,
    createdAt: new Date("2026-08-03T00:00:00Z"),
    planSlot: "b610-2w-threads-20260810-01",
    hasDraftText: true,
    telegramReviewMessageId: null,
    moderationDecisionAt: null,
    ...over,
  };
}

describe("B713 — просроченная строка снимается с перебора", () => {
  it("строка с датой недельной давности больше не остаётся живой", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      rows: [row()],
      plan: contentPlanFor(NOW),
    });
    const touched = actions.find((action) => action.id === "stale-threads");
    expect(touched).toBeDefined();
    expect(["retire", "schedule"]).toContain(touched?.kind);
  });

  it("причина называет просрочку, а не выдуманный дефект материала", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      rows: [row()],
      plan: contentPlanFor(NOW),
    });
    const touched = actions.find((action) => action.id === "stale-threads");
    expect(touched?.reason).toMatch(/просроч|прошл/i);
  });

  it("свежая просрочка внутри суток остаётся механизму переноса B645", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      // Слот закрылся три часа назад: это работа переноса, а не сторожа.
      rows: [row({ id: "fresh", scheduledFor: new Date("2026-08-17T09:00:00Z") })],
      plan: contentPlanFor(NOW),
    });
    expect(actions.find((action) => action.id === "fresh")).toBeUndefined();
  });

  it("выпущенную строку правило не трогает", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      rows: [row({
        id: "done",
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-10T14:00:30Z"),
      })],
      plan: contentPlanFor(NOW),
    });
    expect(actions.find((action) => action.id === "done" && action.kind === "retire"))
      .toBeUndefined();
  });
});
