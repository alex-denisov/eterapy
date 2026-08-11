/**
 * B702 фаза 6 — тренд как РОСТ частотности, а не как её величина.
 *
 * Спрос (фаза 1) отвечает «сколько людей ищут», динамика — «стало ли их больше
 * прямо сейчас». Головная фраза с 200 000 показов в месяц и ровным графиком
 * трендом не является: она давно в ядре и уже учтена спросом.
 *
 * Форма запроса и ответа проверена живьём на проде 2026-08-11:
 * `POST /v2/wordstat/dynamics`, `period: "PERIOD_WEEKLY"`, даты RFC3339,
 * ответ `{ results: [{ date, count (СТРОКОЙ), share }] }`.
 */

import {
  WORDSTAT_TREND_MIN_GROWTH,
  parseWordstatDynamics,
  resetWordstatTrendCache,
  wordstatDynamicsTrends,
} from "@/lib/marketing/trend-wordstat";

// Ответ держится в памяти процесса шесть часов, иначе проход конвейера стал бы
// очередью к API. В прогонах эта же память склеивает случаи между собой.
beforeEach(() => resetWordstatTrendCache());

function series(...counts: number[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: counts.map((count, index) => ({
        date: `2026-06-0${index + 1}T00:00:00Z`,
        // Яндекс отдаёт число СТРОКОЙ — на этом легко потерять значение.
        count: String(count),
        share: 0.01,
      })),
    }),
  } as unknown as Response;
}

describe("B702 фаза 6 — динамика Wordstat как источник трендов", () => {
  it("окно недельного периода: с понедельника по воскресенье", async () => {
    // Живой прогон на проде 2026-08-11: все 13 вызовов вернули 400 «The from
    // field value should be Monday», а `allSettled` их проглотил — источник
    // отдавал ноль кандидатов за 132 мс и выглядел как «трендов нет».
    let sent: { fromDate?: string; toDate?: string } = {};
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body ?? "{}"));
      return series(100, 100, 100, 100, 100, 100, 100);
    });

    await wordstatDynamicsTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["фраза"],
      apiKey: "ключ",
      folderId: "папка",
      now: new Date("2026-08-11T15:00:00Z"),
      useCache: false,
    });

    expect(new Date(String(sent.fromDate)).getUTCDay()).toBe(1);
    expect(new Date(String(sent.toDate)).getUTCDay()).toBe(0);
    // Полночь UTC: у времени внутри суток тоже был отказ по формату.
    expect(sent.fromDate).toMatch(/T00:00:00/);
  });

  it("разбирает строковый count и не теряет значений", () => {
    const parsed = parseWordstatDynamics({
      results: [
        { date: "2026-06-01T00:00:00Z", count: "223386", share: 0.0098 },
        { date: "2026-06-08T00:00:00Z", count: "213025", share: 0.0094 },
      ],
    });
    expect(parsed).toEqual([223_386, 213_025]);
  });

  it("растущая фраза становится кандидатом, ровная — нет", async () => {
    const growing = "матрица судьбы";
    const flat = "натальная карта";
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { phrase?: string };
      return body.phrase === growing
        ? series(100, 100, 100, 100, 180, 190, 200)
        : series(100, 101, 99, 100, 100, 101, 100);
    });

    const trends = await wordstatDynamicsTrends({
      fetchImpl: fetchImpl as never,
      phrases: [growing, flat],
      apiKey: "ключ",
      folderId: "папка",
    });

    expect(trends.map((item) => item.topic)).toEqual([growing]);
    expect(trends[0].source).toBe("wordstatDynamics");
    expect(trends[0].rationale).toMatch(/\d+ ?%/);
  });

  it("не бьёт по API всеми фразами разом", async () => {
    // Живой прогон на проде 2026-08-11: 13 параллельных вызовов дали 429 на
    // трёх фразах. Живой wordstat в `search-marketing-data` по той же причине
    // ходит по две фразы за раз.
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = jest.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return series(100, 100, 100, 100, 100, 100, 100);
    });

    await wordstatDynamicsTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["один", "два", "три", "четыре", "пять", "шесть"],
      apiKey: "ключ",
      folderId: "папка",
      useCache: false,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("порог роста осмысленный, а не любое колебание", () => {
    expect(WORDSTAT_TREND_MIN_GROWTH).toBeGreaterThan(0.1);
  });

  it("без ключа в сеть не ходит вовсе", async () => {
    const fetchImpl = jest.fn();
    await expect(wordstatDynamicsTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["матрица судьбы"],
      apiKey: "",
      folderId: "",
    })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("отказ по одной фразе не отменяет остальные", async () => {
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { phrase?: string };
      if (body.phrase === "падает") throw new Error("сеть");
      return series(100, 100, 100, 100, 200, 210, 220);
    });

    const trends = await wordstatDynamicsTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["падает", "растёт"],
      apiKey: "ключ",
      folderId: "папка",
    });

    expect(trends.map((item) => item.topic)).toEqual(["растёт"]);
  });

  it("второй заход в течение окна памяти в сеть не идёт", async () => {
    const fetchImpl = jest.fn(async () => series(100, 100, 100, 100, 200, 210, 220));
    const args = {
      fetchImpl: fetchImpl as never,
      phrases: ["растёт"],
      apiKey: "ключ",
      folderId: "папка",
    };

    const first = await wordstatDynamicsTrends(args);
    const second = await wordstatDynamicsTrends(args);

    expect(first).toEqual(second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("короткий ряд трендом не объявляется", async () => {
    const fetchImpl = jest.fn(async () => series(100, 300));
    const trends = await wordstatDynamicsTrends({
      fetchImpl: fetchImpl as never,
      phrases: ["две точки"],
      apiKey: "ключ",
      folderId: "папка",
    });
    expect(trends).toEqual([]);
  });
});
