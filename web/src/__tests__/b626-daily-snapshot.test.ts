/**
 * B626 — суточный срез поисковой аналитики.
 *
 * Владелец 2026-07-30 сообщил, что маркетинговые таблицы «не обновляются».
 * Проверка показала обратное: они собираются живым запросом при каждом
 * открытии страницы, а пустыми выглядят потому, что источник пуст (одна
 * страница в индексе Яндекса). Но по экрану «данных нет» и «мы перестали
 * спрашивать» неразличимы, поэтому срез снимается раз в московские сутки и
 * получает отметку времени. Здесь держатся два свойства: один срез в сутки и
 * запрет записывать отказ источника как нулевой результат.
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

// B697: поток теперь берётся посуточным рядом источника, а не итогом окна.
// Разбор самих рядов и посуточная запись проверяются в b697-*.
const fetchWebmasterDailySeries = jest.fn();
const fetchMetrikaDailyVisits = jest.fn();
jest.mock("@/lib/marketing/search-daily-series", () => ({
  __esModule: true,
  ...jest.requireActual("@/lib/marketing/search-daily-series"),
  fetchWebmasterDailySeries: (...args: unknown[]) => fetchWebmasterDailySeries(...args),
  fetchMetrikaDailyVisits: (...args: unknown[]) => fetchMetrikaDailyVisits(...args),
}));

import {
  captureMarketingDailySnapshot,
  marketingSnapshotDue,
  moscowDayKey,
} from "@/lib/marketing/daily-snapshot";

const NOW = new Date("2026-07-30T21:30:00.000Z");

beforeEach(() => {
  upsert.mockReset().mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
    ...create,
    capturedAt: NOW,
    averagePosition: create.averagePosition ?? null,
  }));
  findUnique.mockReset().mockResolvedValue(null);
  getSearchMarketingData.mockReset();
  fetchWebmasterDailySeries.mockReset().mockResolvedValue(new Map([["2026-07-31", { impressions: 12, clicks: 1 }]]));
  fetchMetrikaDailyVisits.mockReset().mockResolvedValue(new Map([["2026-07-31", 30]]));
});

describe("ключ суток", () => {
  it("берётся по московскому времени, а не по UTC", () => {
    // 21:30 UTC — это уже следующие сутки в Москве. Ключ по UTC разложил бы
    // вечерний срез во вчерашний день и создал бы «пропущенные» сутки.
    expect(moscowDayKey(NOW)).toBe("2026-07-31");
  });
});

describe("снятие среза", () => {
  it("пишет значения и число наблюдаемых запросов за московские сутки", async () => {
    getSearchMarketingData.mockResolvedValue({
      totals: { impressions: 12, clicks: 1, averagePosition: 8.4, organicVisits: 30 },
      webmaster: { summary: { searchablePages: 1 }, queries: [{ query: "ии психолог" }] },
      sources: [{ key: "webmaster", status: "ready", note: "ok" }],
    });

    const row = await captureMarketingDailySnapshot({ now: NOW });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].where).toEqual({ dayKey: "2026-07-31" });
    expect(row).toMatchObject({
      dayKey: "2026-07-31",
      impressions: 12,
      clicks: 1,
      searchablePages: 1,
      observedQueries: 1,
    });
  });

  it("отказ источника не записывается как нулевой замер", async () => {
    getSearchMarketingData.mockRejectedValue(new Error("Webmaster 502"));
    fetchWebmasterDailySeries.mockRejectedValue(new Error("Webmaster 502"));
    fetchMetrikaDailyVisits.mockRejectedValue(new Error("Metrika 502"));

    const row = await captureMarketingDailySnapshot({ now: NOW });

    // «Нам не ответили» и «значение равно нулю» — разные факты. Подменять один
    // другим значит врать в истории, по которой потом считают динамику.
    expect(row).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("нужен ли срез", () => {
  it("не нужен, если строка за эти сутки только что переснята", async () => {
    // B697: строка за сутки одна, но переснимается несколько раз в день —
    // источники правят вчерашние данные задним числом.
    findUnique.mockResolvedValue({ capturedAt: new Date(NOW.getTime() - 30 * 60_000) });
    expect(await marketingSnapshotDue(NOW)).toBe(false);
  });

  it("нужен, когда строки за сутки нет", async () => {
    // Проверка идёт запросом по уникальному ключу дня, а не таймером в памяти:
    // перезапуск воркера не должен ни пропускать сутки, ни дублировать срез.
    expect(await marketingSnapshotDue(NOW)).toBe(true);
  });
});
