/**
 * B700 фаза 5 — сводка конвейера отвечает на вопрос «почему линия молчит».
 *
 * ЗАЧЕМ ОНА ОТДЕЛЬНО ОТ ЖУРНАЛА. Числа такта пишутся в строку прохода, но
 * журнал прода эфемерен: он умирает с контейнером при следующей выкатке и живёт
 * сразу на двух нодах. Вопрос «почему линия молчала» задаётся уже ПОСЛЕ того,
 * как она молчала, — и ответ не должен зависеть от того, успел ли кто-то
 * прочитать логи вовремя.
 *
 * ГРАНИЦЫ, КОТОРЫЕ ДЕРЖИТ ЭТОТ ТЕСТ:
 *   1. причина простоя ОДНА и это самая связывающая — иначе владелец чинит не
 *      то узкое место;
 *   2. полный буфер называется нормой, а не простоем;
 *   3. пауза линии сильнее любых других причин и сообщает СРОК;
 *   4. отсутствие второй модели для редактора видно раньше цифр ёмкости.
 */

import { conveyorSnapshot } from "@/lib/marketing/conveyor-snapshot";
import db from "@/lib/db";
import { marketingHourlyCapacity } from "@/lib/marketing/pool-capacity";
import { marketingCapacityPausedUntil } from "@/lib/marketing/agent";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { externalPublication: { count: jest.fn() } },
}));

jest.mock("@/lib/marketing/pool-capacity", () => ({
  __esModule: true,
  marketingHourlyCapacity: jest.fn(),
}));

jest.mock("@/lib/marketing/agent", () => ({
  __esModule: true,
  MARKETING_GENERATION_LEAD_MS: 30 * 60 * 60_000,
  marketingGenerationHorizon: (now: Date) => new Date(now.getTime() + 30 * 60 * 60_000),
  marketingBufferTarget: () => 6,
  marketingCapacityPausedUntil: jest.fn(),
}));

const mockCount = db.externalPublication.count as jest.Mock;
const mockCapacity = marketingHourlyCapacity as jest.Mock;
const mockPaused = marketingCapacityPausedUntil as jest.Mock;

const NOW = new Date("2026-08-11T09:00:00.000Z");

/** Порядок вызовов повторяет порядок в `Promise.all` сводки. */
function counts(input: {
  writtenThisHour: number;
  deferred: number;
  awaitingReview: number;
  demand: number;
  ready: number;
}) {
  mockCount
    .mockResolvedValueOnce(input.writtenThisHour)
    .mockResolvedValueOnce(input.deferred)
    .mockResolvedValueOnce(input.awaitingReview)
    .mockResolvedValueOnce(input.demand)
    .mockResolvedValueOnce(input.ready);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPaused.mockResolvedValue(null);
  mockCapacity.mockResolvedValue({ perHour: 10, materialsLeftToday: 40, canSeparateRoles: true });
});

describe("B700 фаза 5 — сводка конвейера", () => {
  it("линия работает: сводка называет разрешение автору, а не причину простоя", async () => {
    counts({ writtenThisHour: 0, deferred: 12, awaitingReview: 1, demand: 8, ready: 2 });

    const snapshot = await conveyorSnapshot({ now: NOW });

    expect(snapshot.writerBudget).toBeGreaterThan(0);
    expect(snapshot.idleReason).toContain("Линия работает");
    expect(snapshot.demand).toBe(8);
    expect(snapshot.deferred).toBe(12);
    expect(snapshot.buffer).toBe(6);
  });

  it("полный запас впереди — это норма, а не простой", async () => {
    counts({ writtenThisHour: 0, deferred: 0, awaitingReview: 0, demand: 3, ready: 20 });

    const snapshot = await conveyorSnapshot({ now: NOW });

    expect(snapshot.writerBudget).toBe(0);
    expect(snapshot.bottleneck).toBe("buffer");
    expect(snapshot.idleReason).toContain("норма, а не простой");
  });

  it("очередь редактора полна — названо узкое место, а не квоты", async () => {
    counts({ writtenThisHour: 0, deferred: 0, awaitingReview: 6, demand: 20, ready: 0 });

    const snapshot = await conveyorSnapshot({ now: NOW });

    expect(snapshot.bottleneck).toBe("drum");
    expect(snapshot.idleReason).toContain("Очередь редактора полна");
    expect(snapshot.awaitingReview).toBe(6);
  });

  it("пауза линии сильнее всего остального и называет срок", async () => {
    mockPaused.mockResolvedValue(new Date("2026-08-11T10:12:00.000Z"));
    counts({ writtenThisHour: 0, deferred: 0, awaitingReview: 0, demand: 20, ready: 0 });

    const snapshot = await conveyorSnapshot({ now: NOW });

    expect(snapshot.pausedUntil?.toISOString()).toBe("2026-08-11T10:12:00.000Z");
    expect(snapshot.writerBudget).toBe(0);
    expect(snapshot.capacityPerHour).toBe(0);
    expect(snapshot.idleReason).toContain("на паузе до");
    // На паузе ёмкость не спрашивается вовсе: проход её тоже не спрашивает.
    expect(mockCapacity).not.toHaveBeenCalled();
  });

  it("нет второй модели для редактора — это видно раньше цифр ёмкости", async () => {
    mockCapacity.mockResolvedValue({ perHour: 0, materialsLeftToday: 0, canSeparateRoles: false });
    counts({ writtenThisHour: 0, deferred: 0, awaitingReview: 0, demand: 20, ready: 0 });

    const snapshot = await conveyorSnapshot({ now: NOW });

    expect(snapshot.canSeparateRoles).toBe(false);
    expect(snapshot.idleReason).toContain("нет модели, отличной от модели автора");
  });

  it("сбой чтения ёмкости не роняет сводку, а обнуляет её честно", async () => {
    mockCapacity.mockRejectedValue(new Error("pool down"));
    counts({ writtenThisHour: 0, deferred: 0, awaitingReview: 0, demand: 20, ready: 0 });

    const snapshot = await conveyorSnapshot({ now: NOW });

    expect(snapshot.capacityPerHour).toBe(0);
    expect(snapshot.writerBudget).toBe(0);
  });
});
