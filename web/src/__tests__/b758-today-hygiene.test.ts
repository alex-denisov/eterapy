import { contentPlanFor, hygienePlanFor } from "@/lib/marketing/content-plan";
import { planQueueHygiene, type QueueRow } from "@/lib/marketing/queue-hygiene";

const now = new Date("2026-11-19T00:00:32Z");

test("queue hygiene retains a future slot today and the full ordinary horizon", () => {
  const today = contentPlanFor(now, null, { includeToday: true }).find(s => s.key === "b610-2w-threads-20261119-06")!;
  expect(today).toBeDefined();
  const row: QueueRow = { id: "today", platform: "threads", status: "DRAFT", contentType: "POST", scheduledFor: new Date(today.scheduledAt), publishedAt: null, createdAt: now, planSlot: today.key, hasDraftText: false, telegramReviewMessageId: null, moderationDecisionAt: null };
  const plan = hygienePlanFor(now, null);
  expect(planQueueHygiene({ now, plan, rows: [row] }).actions).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "retire", id: "today" })]));
  const keys = new Set(plan.map(s => s.key));
  expect(contentPlanFor(now).every(s => keys.has(s.key))).toBe(true);
  expect(keys.size).toBe(plan.length);
  const removed = { ...row, id: "removed", planSlot: "obsolete-today-slot" };
  expect(planQueueHygiene({ now, plan, rows: [removed] }).actions).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "retire", id: "removed" })]));
});
