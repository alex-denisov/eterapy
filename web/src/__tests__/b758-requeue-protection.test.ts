jest.mock("@/lib/db", () => ({ __esModule: true, default: { externalPublication: { findMany: jest.fn(), updateMany: jest.fn() } } }));
import db from "@/lib/db";
import { applyDirective } from "@/lib/marketing/orchestrator-actions";

test("orchestrator does not restore deliberately superseded posts", async () => {
  const findMany = db.externalPublication.findMany as jest.Mock;
  const updateMany = db.externalPublication.updateMany as jest.Mock;
  findMany.mockResolvedValue([
    { id: "superseded", status: "ARCHIVED", archiveReason: "B758: replaced by new Threads content policy", lastError: null, planSlot: null, scheduledFor: new Date("2099-01-01") },
    { id: "technical", status: "FAILED", archiveReason: null, lastError: "fetch failed", planSlot: "slot", scheduledFor: new Date("2099-01-01") },
  ]);
  updateMany.mockResolvedValue({ count: 1 });
  const out = await applyDirective({ key: "test", target: "smm", action: "requeue_publications", payload: { ids: ["superseded", "technical"] }, problem: "test", rationale: "test", risk: "reversible" });
  expect(out.applied).toBe(true);
  expect(updateMany.mock.calls[0][0].where.id.in).toEqual(["technical"]);
});
