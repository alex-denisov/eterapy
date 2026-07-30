/**
 * B626 — восстановление реестра и гигиена сигналов.
 *
 * Владелец 2026-07-30 видел в кокпите десятки строк «ошибка»/«архив» без
 * причины и «огромную кучу инцидентов», часть которых относилась к давно
 * прошедшим отказам. Тесты держат три границы: что считается исправимым, что
 * нельзя возвращать в работу задним числом, и когда сигнал обязан закрыться сам.
 */

import { archiveReasonLabel } from "@/lib/external-publication-shared";

const publicationFindMany = jest.fn();
const publicationUpdate = jest.fn();
const publicationGroupBy = jest.fn();
const signalFindMany = jest.fn();
const signalUpdateMany = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      update: (...args: unknown[]) => publicationUpdate(...args),
      groupBy: (...args: unknown[]) => publicationGroupBy(...args),
    },
    marketingAutomationSignal: {
      findMany: (...args: unknown[]) => signalFindMany(...args),
      updateMany: (...args: unknown[]) => signalUpdateMany(...args),
      upsert: jest.fn(),
    },
  },
}));

jest.mock("@/lib/marketing/agent", () => ({
  __esModule: true,
  resolveMarketingSignal: jest.fn().mockResolvedValue(undefined),
  upsertMarketingSignal: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: jest.fn().mockResolvedValue(false),
}));

import {
  MAX_RECOVERY_ATTEMPTS,
  isRecoverablePublicationError,
  reconcileMarketingSignals,
  recoverFailedPublications,
} from "@/lib/marketing/registry-recovery";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const FUTURE = new Date("2026-07-31T12:00:00.000Z");
const PAST = new Date("2026-07-29T12:00:00.000Z");

beforeEach(() => {
  publicationFindMany.mockReset().mockResolvedValue([]);
  publicationUpdate.mockReset().mockResolvedValue({});
  publicationGroupBy.mockReset().mockResolvedValue([]);
  signalFindMany.mockReset().mockResolvedValue([]);
  signalUpdateMany.mockReset().mockResolvedValue({ count: 0 });
});

describe("что считается техническим отказом", () => {
  it.each([
    "Telegram publication exceeds the 1000-character media caption budget",
    "writer returned invalid or incomplete structured output",
    "fetch failed",
    "VK responded 503",
  ])("исправимо: %s", (message) => {
    expect(isRecoverablePublicationError(message)).toBe(true);
  });

  it.each([
    "Independent reviewer did not approve the draft in three rounds",
    "writer safety block: self-harm",
    "owned publication has no destination URL in the plan",
  ])("не исправимо повтором: %s", (message) => {
    // Повтор дал бы тот же результат за счёт той же бесплатной ёмкости.
    expect(isRecoverablePublicationError(message)).toBe(false);
  });

  it("пустая причина не делает строку исправимой", () => {
    expect(isRecoverablePublicationError(null)).toBe(false);
  });
});

describe("восстановление отказавших публикаций", () => {
  it("возвращает в работу технический отказ, у которого слот ещё впереди", async () => {
    publicationFindMany.mockResolvedValue([{
      id: "pub-1",
      key: "tg-1",
      platform: "telegram",
      scheduledFor: FUTURE,
      lastError: "Telegram publication exceeds the 1000-character media caption budget",
      recoveryCount: 0,
    }]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.requeued).toBe(1);
    const data = publicationUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("DRAFT");
    // Счётчик попыток обнуляется, иначе строка упрётся в лимит раундов заново.
    expect(data.attemptCount).toBe(0);
    expect(data.agentReviewedAt).toBeNull();
    expect(data.recoveryCount).toEqual({ increment: 1 });
  });

  it("не возвращает материал, чей слот уже прошёл: он вышел бы задним числом", async () => {
    publicationFindMany.mockResolvedValue([{
      id: "pub-2",
      key: "tg-2",
      platform: "telegram",
      scheduledFor: PAST,
      lastError: "fetch failed",
      recoveryCount: 0,
    }]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.requeued).toBe(0);
    expect(result.archived).toBe(1);
    const data = publicationUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("ARCHIVED");
    expect(data.archiveReason).toContain("Срок слота прошёл");
  });

  it("перестаёт возвращать строку после исчерпания попыток", async () => {
    publicationFindMany.mockResolvedValue([{
      id: "pub-3",
      key: "tg-3",
      platform: "telegram",
      scheduledFor: FUTURE,
      lastError: "fetch failed",
      recoveryCount: MAX_RECOVERY_ATTEMPTS,
    }]);

    const result = await recoverFailedPublications({ now: NOW });

    // Слот ещё впереди — архивировать рано, но и жечь ёмкость повторами нельзя.
    expect(result.requeued).toBe(0);
    expect(result.archived).toBe(0);
    expect(publicationUpdate).not.toHaveBeenCalled();
  });

  it("называет площадку, у которой утверждённые материалы стоят из-за выключенного коннектора", async () => {
    publicationGroupBy.mockResolvedValue([{ platform: "vk", _count: { _all: 4 } }]);

    const result = await recoverFailedPublications({ now: NOW });

    // Это самый тихий отказ: выпуск пропускает такие строки без ошибки, и
    // снаружи это выглядит как «публикации не появляются».
    expect(result.blockedPlatforms).toEqual(["vk"]);
  });
});

describe("гигиена сигналов", () => {
  it("снимает инцидент публикации, которая больше не в отказе", async () => {
    signalFindMany.mockResolvedValue([
      { id: "sig-1", key: "agent-draft:pub-1", lastSeenAt: NOW },
    ]);
    publicationFindMany.mockResolvedValue([]);
    signalUpdateMany.mockResolvedValue({ count: 1 });

    const result = await reconcileMarketingSignals({ now: NOW });

    expect(result.resolvedByState).toBe(1);
  });

  it("оставляет инцидент, пока публикация всё ещё в отказе", async () => {
    signalFindMany.mockResolvedValue([
      { id: "sig-2", key: "agent-draft:pub-2", lastSeenAt: NOW },
    ]);
    publicationFindMany.mockResolvedValue([{ id: "pub-2" }]);

    const result = await reconcileMarketingSignals({ now: NOW });

    expect(result.resolvedByState).toBe(0);
    expect(result.resolvedByAge).toBe(0);
  });

  it("закрывает по давности сигнал, который перестал повторяться", async () => {
    signalFindMany.mockResolvedValue([
      { id: "sig-3", key: "worker:discovery", lastSeenAt: new Date("2026-07-25T12:00:00.000Z") },
    ]);
    signalUpdateMany.mockResolvedValue({ count: 1 });

    const result = await reconcileMarketingSignals({ now: NOW });

    expect(result.resolvedByAge).toBe(1);
  });
});

describe("причина архивации на человеческом языке", () => {
  it("переводит машинный код прошлого решения", () => {
    expect(archiveReasonLabel("SUPERSEDED_BY_B610_TWO_WEEK_PLAN"))
      .toBe("Заменено новым двухнедельным контент-планом");
    expect(archiveReasonLabel("OUT_OF_PERIMETER_B617"))
      .toContain("Вне законного периметра");
  });

  it("незнакомую причину показывает как есть, а не прячет", () => {
    expect(archiveReasonLabel("VK responded 500")).toBe("VK responded 500");
    expect(archiveReasonLabel(null)).toBeNull();
  });
});
