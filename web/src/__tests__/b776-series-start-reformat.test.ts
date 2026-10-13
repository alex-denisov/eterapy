const rows: Array<{ id: string; planSlot: string; status: string; attemptCount: number; scheduledFor: Date; notes: string }> = [];
const settings = new Map<string, string>();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    platformSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (settings.has(where.key) ? { value: settings.get(where.key) } : null),
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => { settings.set(where.key, create.value); },
    },
    externalPublication: {
      findMany: async () => rows.filter((row) => row.status === "DRAFT" && row.attemptCount === 0),
      findFirst: async ({ where }: { where: { planSlot: string } }) => rows.find((row) => row.planSlot === where.planSlot) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { notes: string } }) => {
        const row = rows.find((item) => item.id === where.id)!;
        row.notes = data.notes;
      },
    },
  },
}));

import { contentPlanFor } from "@/lib/marketing/content-plan";
import { startSeriesCommand, stopSeriesCommand } from "@/lib/marketing/threads-series-start";
import { SERIES_FORMAT, SERIES_SETTING_KEY } from "@/lib/marketing/threads-series";

const NOW = new Date("2026-10-13T08:00:00Z");

function seedRows(status = "DRAFT", attemptCount = 0) {
  rows.length = 0;
  for (const slot of contentPlanFor(NOW, null, { includeToday: true }).filter((item) => item.channel === "threads")) {
    rows.push({
      id: slot.key, planSlot: slot.key, status, attemptCount, scheduledFor: new Date(slot.scheduledAt),
      notes: JSON.stringify({ format: slot.format, formatRules: slot.formatRules, formatReply: slot.formatReply, keep: "me" }),
    });
  }
}

describe("B776 HIGH-1: старт серии пересобирает незаписанные строки", () => {
  beforeEach(() => { settings.clear(); seedRows(); });

  it("с сегодняшним открытым вечерним слотом серия стартует сегодня, строки получают formatSeries", async () => {
    const { reply } = await startSeriesCommand(NOW);
    expect(JSON.parse(settings.get(SERIES_SETTING_KEY)!).startDate).toBe("2026-10-13");
    expect(reply).toMatch(/сегодня вечером/);
    const series = rows.filter((row) => JSON.parse(row.notes).format === SERIES_FORMAT.label);
    expect(series.length).toBeGreaterThanOrEqual(7);
    const first = series.map((row) => JSON.parse(row.notes)).find((notes) => notes.formatSeries.day === 1);
    expect(first.formatSeries.isAnnouncement).toBe(true);
    expect(JSON.parse(series[0].notes).keep).toBe("me");
  });

  it("если сегодняшняя строка уже написана — старт завтра, написанные строки не трогаются", async () => {
    seedRows("SCHEDULED", 1);
    const before = rows.map((row) => row.notes);
    await startSeriesCommand(NOW);
    expect(JSON.parse(settings.get(SERIES_SETTING_KEY)!).startDate).toBe("2026-10-14");
    expect(rows.map((row) => row.notes)).toEqual(before);
  });

  it("повторный старт при активной серии — без сброса счётчика", async () => {
    await startSeriesCommand(NOW);
    const saved = settings.get(SERIES_SETTING_KEY);
    const { reply } = await startSeriesCommand(new Date("2026-10-15T08:00:00Z"));
    expect(settings.get(SERIES_SETTING_KEY)).toBe(saved);
    expect(reply).toMatch(/День 3\/30/);
  });

  it("стоп возвращает обычные форматы незаписанных строк", async () => {
    await startSeriesCommand(NOW);
    await stopSeriesCommand(NOW);
    expect(JSON.parse(settings.get(SERIES_SETTING_KEY)!).active).toBe(false);
    expect(rows.some((row) => JSON.parse(row.notes).format === SERIES_FORMAT.label)).toBe(false);
  });
});
