/** B750 — очистка очереди: только NEW, с причиной, идемпотентно. */
const findMany = jest.fn();
const updateMany = jest.fn();
const pagesFindMany = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { seoKeywordCandidate: { findMany: (...a: unknown[]) => findMany(...a), updateMany: (...a: unknown[]) => updateMany(...a) }, seoLibraryPage: { findMany: (...a: unknown[]) => pagesFindMany(...a) } },
}));

import { rejectIrrelevantCandidates } from "@/lib/seo/demand/relevance-cleanup";

/** NEW — строки очереди; остальные статусы по умолчанию пусты. */
function mockRows(rows: unknown[], others: unknown[] = []) {
  findMany.mockImplementation(async (args: { where: { status: unknown } }) =>
    args.where.status === "NEW" ? rows : others,
  );
}

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset();
  pagesFindMany.mockReset();
  pagesFindMany.mockResolvedValue([]);
  updateMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
});

describe("B750 rejectIrrelevantCandidates", () => {
  it("отклоняет мусор с причиной и оставляет живой запрос", async () => {
    mockRows([
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
    mockRows([{ id: "b", phrase: "как понять что он меня не любит", cluster: "Пара" }]);
    expect(await rejectIrrelevantCandidates()).toEqual({ scanned: 1, rejected: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("из группы близких оставляет самую частотную, остальные — дубль темы", async () => {
    mockRows([
      { id: "a", phrase: "как быстро принять решение", cluster: "Ясность", monthlyDemand: 900, firstSeenAt: new Date(2) },
      { id: "b", phrase: "как принять нужное решение", cluster: "Ясность", monthlyDemand: 1500, firstSeenAt: new Date(3) },
      { id: "c", phrase: "как принять важное решение", cluster: "Ясность", monthlyDemand: 1500, firstSeenAt: new Date(4) },
      { id: "d", phrase: "муж молчит что делать", cluster: "Пара", monthlyDemand: 400, firstSeenAt: new Date(1) },
    ]);
    const result = await rejectIrrelevantCandidates();
    expect(result.rejected).toBe(2);
    const rejected = updateMany.mock.calls.flatMap((c) => c[0].where.id.in).sort();
    expect(rejected).toEqual(["a", "c"]);
    const reasons = updateMany.mock.calls.map((c) => c[0].data.rejectReason);
    expect(reasons.every((r: string) => r === "B750: дубль темы — как принять нужное решение")).toBe(true);
  });

  it("дубль USED/PLANNED и опубликованной страницы отклоняется", async () => {
    mockRows(
      [
        { id: "a", phrase: "как быстро принять решение", cluster: "Ясность", monthlyDemand: 900, firstSeenAt: new Date(1) },
        { id: "b", phrase: "почему муж не пишет", cluster: "Пара", monthlyDemand: 700, firstSeenAt: new Date(1) },
      ],
      [{ phrase: "почему муж не пишет мне" }],
    );
    pagesFindMany.mockResolvedValue([{ targetQuery: "как принять решение" }]);
    const result = await rejectIrrelevantCandidates();
    expect(result.rejected).toBe(2);
    const reasons = updateMany.mock.calls.map((c) => c[0].data.rejectReason).sort();
    expect(reasons[0]).toMatch(/^B750: дубль темы — /);
  });

  it("не трогает не-NEW: условие записи повторяет status NEW", async () => {
    mockRows([{ id: "a", phrase: "арканы дота 2", cluster: "x", monthlyDemand: 1, firstSeenAt: new Date(1) }]);
    await rejectIrrelevantCandidates();
    expect(updateMany.mock.calls[0][0].where.status).toBe("NEW");
  });
});
