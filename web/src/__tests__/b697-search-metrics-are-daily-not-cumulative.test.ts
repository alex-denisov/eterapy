/**
 * B697 — показы и клики перестали накапливаться на графике.
 *
 * Владелец 2026-08-07: «статистика показов/кликов суммируется на графике
 * (кумулятивный), а должна выглядеть как показатель на таймлайне».
 *
 * Причина: срез спрашивал у источников окно в 28 дней и клал ИТОГ ОКНА как
 * значение дня. Соседние сутки перекрывались на 27 дней из 28. Здесь держатся
 * три свойства: поток пишется посуточно, уровень прошедших суток задним числом
 * не переписывается, и отказ обоих источников не записывается как ноль.
 */

const upsert = jest.fn();
const findUnique = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    marketingDailySnapshot: {
      upsert: (...args: unknown[]) => upsert(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

const getSearchMarketingData = jest.fn();
jest.mock("@/lib/search-marketing-data", () => ({
  __esModule: true,
  getSearchMarketingData: (...args: unknown[]) => getSearchMarketingData(...args),
}));

const fetchWebmasterDailySeries = jest.fn();
const fetchMetrikaDailyVisits = jest.fn();
jest.mock("@/lib/marketing/search-daily-series", () => {
  const actual = jest.requireActual("@/lib/marketing/search-daily-series");
  return {
    __esModule: true,
    ...actual,
    fetchWebmasterDailySeries: (...args: unknown[]) => fetchWebmasterDailySeries(...args),
    fetchMetrikaDailyVisits: (...args: unknown[]) => fetchMetrikaDailyVisits(...args),
  };
});

import { captureMarketingDailySnapshot, marketingSnapshotDue } from "@/lib/marketing/daily-snapshot";
import {
  mergeDailyFlow,
  moscowDayRange,
  parseMetrikaDailyVisits,
  parseWebmasterDailySeries,
} from "@/lib/marketing/search-daily-series";

const NOW = new Date("2026-08-07T00:55:00.000Z"); // 03:55 МСК 7 августа

const LEVEL = {
  totals: { impressions: 31, clicks: 2, averagePosition: 12.1, organicVisits: 0 },
  webmaster: { summary: { searchablePages: 213 }, queries: new Array(24).fill({ query: "ии психолог" }) },
  sources: [{ key: "webmaster", status: "ready", note: "ok" }],
};

beforeEach(() => {
  upsert.mockReset().mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
    averagePosition: null,
    searchablePages: null,
    observedQueries: null,
    ...create,
    capturedAt: NOW,
  }));
  findUnique.mockReset().mockResolvedValue(null);
  getSearchMarketingData.mockReset().mockResolvedValue(LEVEL);
  fetchWebmasterDailySeries.mockReset().mockResolvedValue(new Map([
    ["2026-08-05", { impressions: 0, clicks: 0 }],
    ["2026-08-06", { impressions: 0, clicks: 0 }],
    ["2026-08-07", { impressions: 4, clicks: 1 }],
  ]));
  fetchMetrikaDailyVisits.mockReset().mockResolvedValue(new Map([
    ["2026-08-05", 0],
    ["2026-08-06", 2],
    ["2026-08-07", 1],
  ]));
});

describe("разбор посуточных рядов", () => {
  it("берёт московские сутки из даты Вебмастера строкой, а не через Date", () => {
    // `2026-07-24T00:00:00.000+03:00` в часовом поясе раннера (UTC) — это ещё
    // 23 июля. Разбор через `new Date()` сдвинул бы весь ряд на день назад.
    const series = parseWebmasterDailySeries({
      indicators: {
        TOTAL_SHOWS: [{ date: "2026-07-24T00:00:00.000+03:00", value: 1.0 }],
        TOTAL_CLICKS: [{ date: "2026-07-24T00:00:00.000+03:00", value: 0.0 }],
      },
    });
    expect(series.get("2026-07-24")).toEqual({ impressions: 1, clicks: 0 });
  });

  it("сводит ряд Метрики по позиции значения в totals, а не по строкам data", () => {
    // При нулевом трафике `data` пуст, но ряд в `totals` есть — и это ответ
    // источника, а не его молчание.
    const visits = parseMetrikaDailyVisits({
      time_intervals: [["2026-08-05", "2026-08-05"], ["2026-08-06", "2026-08-06"]],
      totals: [[0.0, 2.0]],
      data: [],
    });
    expect(visits.get("2026-08-05")).toBe(0);
    expect(visits.get("2026-08-06")).toBe(2);
  });

  it("не выдаёт молчание источника за ноль", () => {
    const merged = mergeDailyFlow({
      days: moscowDayRange("2026-08-05", "2026-08-07"),
      webmaster: new Map([["2026-08-06", { impressions: 3, clicks: 0 }]]),
      metrika: new Map(),
    });
    expect([...merged.keys()]).toEqual(["2026-08-06"]);
  });
});

describe("снятие среза", () => {
  it("пишет ЗА сутки, а не итог окна", async () => {
    await captureMarketingDailySnapshot({ now: NOW });

    const today = upsert.mock.calls.map(([arg]) => arg).find((arg) => arg.where.dayKey === "2026-08-07");
    expect(today.update).toMatchObject({ impressions: 4, clicks: 1, organicVisits: 1 });
    // Итог окна — 31 показ — на график больше не попадает ни при каких условиях.
    expect(today.update.impressions).not.toBe(LEVEL.totals.impressions);
  });

  it("уровень пишет только на сегодня и не переписывает им прошедшие сутки", async () => {
    await captureMarketingDailySnapshot({ now: NOW });

    const calls = upsert.mock.calls.map(([arg]) => arg);
    const today = calls.find((arg) => arg.where.dayKey === "2026-08-07");
    const older = calls.find((arg) => arg.where.dayKey === "2026-08-06");

    expect(today.update).toMatchObject({ searchablePages: 213, observedQueries: 24, averagePosition: 12.1 });
    expect(older.update).toMatchObject({ impressions: 0, clicks: 0, organicVisits: 2 });
    expect(older.update).not.toHaveProperty("searchablePages");
    expect(older.update).not.toHaveProperty("observedQueries");
    expect(older.update).not.toHaveProperty("averagePosition");
  });

  it("переснимает хвост окна, а не только сегодня", async () => {
    await captureMarketingDailySnapshot({ now: NOW });
    expect(upsert.mock.calls.map(([arg]) => arg.where.dayKey).sort()).toEqual([
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);
  });

  it("отказ обоих источников не записывается как ноль", async () => {
    fetchWebmasterDailySeries.mockRejectedValue(new Error("HTTP 502"));
    fetchMetrikaDailyVisits.mockRejectedValue(new Error("HTTP 502"));

    await expect(captureMarketingDailySnapshot({ now: NOW })).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("отказ уровня не отменяет поток — строка пишется без состояния индексации", async () => {
    getSearchMarketingData.mockRejectedValue(new Error("HTTP 500"));

    const row = await captureMarketingDailySnapshot({ now: NOW });

    expect(row).not.toBeNull();
    const today = upsert.mock.calls.map(([arg]) => arg).find((arg) => arg.where.dayKey === "2026-08-07");
    expect(today.update).toMatchObject({ impressions: 4, clicks: 1 });
    expect(today.update).not.toHaveProperty("searchablePages");
  });
});

describe("когда нужен проход", () => {
  it("нужен, если строки за сегодня нет", async () => {
    findUnique.mockResolvedValue(null);
    await expect(marketingSnapshotDue(NOW)).resolves.toBe(true);
  });

  it("не нужен сразу после свежего прохода", async () => {
    findUnique.mockResolvedValue({ capturedAt: new Date(NOW.getTime() - 60 * 60_000) });
    await expect(marketingSnapshotDue(NOW)).resolves.toBe(false);
  });

  it("нужен снова, когда строка давно не переснималась: источник правит данные задним числом", async () => {
    findUnique.mockResolvedValue({ capturedAt: new Date(NOW.getTime() - 7 * 60 * 60_000) });
    await expect(marketingSnapshotDue(NOW)).resolves.toBe(true);
  });
});
