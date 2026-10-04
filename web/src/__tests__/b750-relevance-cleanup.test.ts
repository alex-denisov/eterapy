/** B750 — очистка очереди: только NEW, с причиной, идемпотентно. */
const findMany = jest.fn();
const updateMany = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { seoKeywordCandidate: { findMany: (...a: unknown[]) => findMany(...a), updateMany: (...a: unknown[]) => updateMany(...a) } },
}));

import { rejectIrrelevantCandidates } from "@/lib/seo/demand/relevance-cleanup";

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset();
  updateMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
});

describe("B750 rejectIrrelevantCandidates", () => {
  it("отклоняет мусор с причиной и оставляет живой запрос", async () => {
    findMany.mockResolvedValue([
      { id: "a", phrase: "арканы дота 2", cluster: "Арканы" },
      { id: "b", phrase: "что делать если муж изменяет", cluster: "Пара" },
      { id: "c", phrase: "происхождение фамилии путин", cluster: "Имя и род" },
    ]);
    const result = await rejectIrrelevantCandidates();
    expect(result).toEqual({ scanned: 3, rejected: 2 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "NEW" } }));
    const calls = updateMany.mock.calls.map((c) => c[0]);
    const ids = calls.flatMap((c) => c.where.id.in).sort();
    expect(ids).toEqual(["a", "c"]);
    for (const call of calls) {
      expect(call.where.status).toBe("NEW");
      expect(call.data.status).toBe("REJECTED");
      expect(call.data.rejectReason).toMatch(/^B750: нерелевантно — .+/);
    }
  });

  it("на чистой очереди ничего не пишет", async () => {
    findMany.mockResolvedValue([{ id: "b", phrase: "как понять что он меня не любит", cluster: "Пара" }]);
    expect(await rejectIrrelevantCandidates()).toEqual({ scanned: 1, rejected: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
