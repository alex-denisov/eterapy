import { hasVerifiedSearchFlow, verifiedImpressionsTotal, withVerifiedSearchFlow } from "@/lib/marketing/search-snapshot-provenance";

it("сохраняет другие источники и помечает успешно проверенный ряд", () => {
  const sources = withVerifiedSearchFlow([{ key: "metrika", status: "ready" }]);
  expect(sources).toEqual([{ key: "metrika", status: "ready" }, { key: "webmaster_daily_verified" }]);
  expect(hasVerifiedSearchFlow(sources)).toBe(true);
});

it("не превращает пропущенные или старые неподтверждённые снимки в ноль", () => {
  const start = new Date("2026-11-01T21:00:00Z");
  const now = new Date("2026-11-02T22:00:00Z");
  const measured = { impressions: 0, sources: [{ key: "webmaster_daily_verified" }] };
  expect(verifiedImpressionsTotal([measured], start, now)).toBeNull();
  expect(verifiedImpressionsTotal([measured, { impressions: 0, sources: null }], start, now)).toBeNull();
  expect(verifiedImpressionsTotal([measured, measured], start, now)).toBe(0);
});
