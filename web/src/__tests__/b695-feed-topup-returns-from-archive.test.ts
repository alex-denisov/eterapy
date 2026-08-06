/**
 * B695/B620 — статьи пополнения ленты, сожжённые дефектом, возвращаются в работу.
 *
 * Замер прода 2026-08-06: из четырёх статей `b620-rss-dzen-*`, заведённых ради
 * порога площадки (10 материалов В ЛЕНТЕ), три архивированы за один день с
 * причиной «No free provider returned valid structured output» — то есть по
 * отказу дороги, который B695 признал НЕ виной материала. Лента осталась на
 * двух публикациях вместо пяти.
 *
 * Правило владельца тут прямое: «неправильно выставлять ARCHIVED, если статья
 * не была выпущена; если она хорошая — решедулить, а не отменять» (B645).
 * Материал не был написан вовсе, темы свободны, а порог площадки без этих
 * статей недостижим.
 *
 * Границы возврата:
 * — только ключи пополнения ленты (`b620-rss-dzen-`). Плановые слоты уже имеют
 *   свой механизм перевыпуска (`slotKeyForGeneration`, B643), и второй здесь
 *   означал бы двойное восстановление;
 * — только технический отказ. Решение редактора и safety-блок остаются архивом;
 * — только пока порог ленты не взят. Взяли — возврат выключается сам.
 */

import {
  MAX_FEED_TOPUP_RESTORES,
  restoreDzenFeedTopUp,
} from "@/lib/marketing/publication-queue";

const findMany = jest.fn();
const count = jest.fn();
const update = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => findMany(...args),
      count: (...args: unknown[]) => count(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const NOW = new Date("2026-08-06T18:00:00.000Z");

const archivedRow = (key: string, reason: string, notes: string | null = null) => ({
  id: `id-${key}`,
  key,
  archiveReason: reason,
  lastError: null,
  notes,
});

const TECHNICAL = "Срок слота прошёл, пока материал был в отказе: "
  + "No free provider returned valid structured output (GROQ: All AI providers failed)";

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
  update.mockReset().mockResolvedValue({});
});

describe("возврат статей пополнения ленты", () => {
  it("технический отказ возвращает статью в работу с новым временем", async () => {
    findMany.mockResolvedValue([
      archivedRow("b620-rss-dzen-01", "Срок слота прошёл, пока материал был в отказе: "
        + "No free provider returned valid structured output (GROQ: All AI providers failed)"),
      archivedRow("b620-rss-dzen-03", "Срок слота прошёл, пока материал был в отказе: "
        + "No free provider returned valid structured output (COHERE: All AI providers failed)"),
    ]);

    const restored = await restoreDzenFeedTopUp({ now: NOW });

    expect(restored).toBe(2);
    const data = update.mock.calls.map((call) => (call[0] as { data: Record<string, unknown> }).data);
    for (const row of data) {
      expect(row.status).toBe("DRAFT");
      expect(row.attemptCount).toBe(0);
      expect(row.recoveryCount).toBe(0);
      expect(row.archiveReason).toBeNull();
      expect((row.scheduledFor as Date).getTime()).toBeGreaterThan(NOW.getTime());
    }
    // Статьи разведены по времени: иначе один проход возьмёт их все разом и
    // упрётся в ту же ёмкость, из-за которой они и сгорели.
    const times = data.map((row) => (row.scheduledFor as Date).getTime());
    expect(new Set(times).size).toBe(times.length);
  });

  it("возврат не превращается в круг: у статьи есть предел подъёмов", async () => {
    findMany.mockResolvedValue([
      archivedRow("b620-rss-dzen-01", TECHNICAL,
        JSON.stringify({ format: "статья", b695Restores: MAX_FEED_TOPUP_RESTORES })),
      archivedRow("b620-rss-dzen-03", TECHNICAL, JSON.stringify({ b695Restores: 1 })),
    ]);

    expect(await restoreDzenFeedTopUp({ now: NOW })).toBe(1);
    const data = update.mock.calls[0][0] as { data: { notes: string } };
    // Счётчик растёт и не затирает редакционную заметку.
    expect(JSON.parse(data.data.notes)).toMatchObject({ b695Restores: 2 });
  });

  it("решение редактора и safety-блок остаются архивом", async () => {
    findMany.mockResolvedValue([
      archivedRow("b620-rss-dzen-02", "Материал не прошёл выпуск и не подлежит повтору: "
        + "Independent reviewer did not approve in 3 rounds"),
      archivedRow("b620-rss-dzen-04", "REJECTED_BY_MODERATOR"),
    ]);

    expect(await restoreDzenFeedTopUp({ now: NOW })).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("порог ленты взят — возврат выключается сам", async () => {
    count.mockResolvedValue(10);
    findMany.mockResolvedValue([
      archivedRow("b620-rss-dzen-01", "Срок слота прошёл: No free provider returned valid structured output"),
    ]);

    expect(await restoreDzenFeedTopUp({ now: NOW })).toBe(0);
    expect(update).not.toHaveBeenCalled();
    // Реестр даже не читается: порог берётся первым запросом.
    expect(findMany).not.toHaveBeenCalled();
  });
});
