/**
 * B763 — Instagram на паузе по решению владельца 2026-10-12 (3 просмотра за
 * месяц). Пауза — свойство КАНАЛА: план не даёт ему слотов, сторож очереди
 * снимает живые плановые строки (архив, обратимо), а разговор с людьми
 * (ответы на входящее, комментарии) пауза не трогает.
 */

import { planQueueHygiene, CHANNEL_PAUSED_REASON } from "@/lib/marketing/queue-hygiene";
import { contentPlanFor, isPlanChannelPaused } from "@/lib/marketing/content-plan";

const NOW = new Date("2026-10-12T12:00:00Z");

function row(over: Record<string, unknown> = {}) {
  return {
    id: "ig-1",
    platform: "instagram",
    status: "SCHEDULED",
    contentType: "POST",
    scheduledFor: new Date("2026-10-14T15:00:00Z"),
    publishedAt: null,
    createdAt: new Date("2026-10-10T00:00:00Z"),
    planSlot: "b610-2w-instagram-20261014-01",
    hasDraftText: true,
    telegramReviewMessageId: null,
    moderationDecisionAt: null,
    ...over,
  };
}

describe("B763 — Instagram на паузе", () => {
  it("канал помечен паузой, остальные — нет", () => {
    expect(isPlanChannelPaused("instagram")).toBe(true);
    expect(isPlanChannelPaused("Instagram")).toBe(true);
    for (const channel of ["telegram", "threads", "vk", "dzen"]) {
      expect(isPlanChannelPaused(channel)).toBe(false);
    }
  });

  it("в плане нет ни одного слота Instagram, остальные ленты на месте", () => {
    const plan = contentPlanFor(NOW);
    expect(plan.filter((slot) => slot.channel === "instagram")).toHaveLength(0);
    for (const channel of ["telegram", "threads", "vk", "dzen"]) {
      expect(plan.some((slot) => slot.channel === channel)).toBe(true);
    }
  });

  it("готовый и утверждённый пост Instagram снимается в архив с причиной паузы и отпускает слот", () => {
    const { actions, unplaced } = planQueueHygiene({ now: NOW, rows: [row()], plan: contentPlanFor(NOW) });
    const retire = actions.find((action) => action.id === "ig-1");
    expect(retire).toMatchObject({ kind: "retire", reason: CHANNEL_PAUSED_REASON, releaseSlot: true });
    expect(unplaced).not.toContain("ig-1");
  });

  it("пустой черновик Instagram тоже снимается", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      rows: [row({ id: "ig-2", status: "DRAFT", hasDraftText: false })],
      plan: contentPlanFor(NOW),
    });
    expect(actions).toEqual([expect.objectContaining({ id: "ig-2", kind: "retire", reason: CHANNEL_PAUSED_REASON })]);
  });

  it("ответ живому человеку в Instagram пауза не трогает", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      rows: [row({ id: "ig-reply", contentType: "INBOUND_REPLY", planSlot: null })],
      plan: contentPlanFor(NOW),
    });
    expect(actions.find((action) => action.id === "ig-reply")).toBeUndefined();
  });

  it("опубликованное раньше не трогается", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      rows: [row({ id: "ig-old", status: "PUBLISHED", publishedAt: new Date("2026-10-01T10:00:00Z"), scheduledFor: new Date("2026-10-01T10:00:00Z") })],
      plan: contentPlanFor(NOW),
    });
    expect(actions.find((action) => action.id === "ig-old")).toBeUndefined();
  });
});
