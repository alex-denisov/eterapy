/**
 * B646 — готовый материал старше ненаписанного черновика.
 *
 * Замер прода 2026-08-03 сразу после выкатки B645: все 15 будущих слотов
 * Instagram заняты, 14 из них — черновики без текста. Перенос честно возвращал
 * «свободных слотов нет», и утверждённый материал ждал за строками, которых
 * ещё не существует. Порядок приоритета был обратный здравому смыслу.
 *
 * Границы, которые держат эти прогоны:
 * — свободный слот всегда важнее чужого: пока он есть, никто ничего не уступает;
 * — уступает только DRAFT без отметки редактора (`agentReviewedAt` пуст);
 * — утверждённый материал в слоте не двигается никогда;
 * — донор не выбрасывается: он отпускает слот, оставаясь в реестре.
 */

const publicationFindMany = jest.fn();
const publicationFindFirst = jest.fn();
const publicationUpdate = jest.fn();
const transaction = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      findFirst: (...args: unknown[]) => publicationFindFirst(...args),
      update: (...args: unknown[]) => publicationUpdate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { deferPublicationToNextSlot } from "@/lib/marketing/slot-window";
import { contentPlanFor, plannedAtFor } from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-03T12:00:00.000Z");

/** Слот занимает КАЖДЫЙ будущий слот площадки — ровно состояние прода. */
function everyFutureSlotTaken(platform: string) {
  return contentPlanFor(NOW)
    .filter((slot) => slot.channel === platform)
    .filter((slot) => plannedAtFor(slot).getTime() > NOW.getTime())
    .map((slot) => ({ planSlot: slot.key }));
}

const approved = {
  id: "pub-approved",
  key: "instagram-2026-08-01-morning",
  platform: "instagram",
  planSlot: "instagram-2026-08-01-morning",
  notes: JSON.stringify({ format: "утренняя карточка" }),
  scheduledFor: new Date("2026-08-01T06:00:00.000Z"),
  deferralCount: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  transaction.mockResolvedValue([{}, {}]);
  publicationUpdate.mockResolvedValue({});
});

describe("B646 — перенос при полностью занятом плане", () => {
  it("забирает ближайший слот у ненаписанного черновика", async () => {
    publicationFindMany.mockResolvedValue(everyFutureSlotTaken("instagram"));
    const donorSlotAt = new Date("2026-08-04T06:00:00.000Z");
    publicationFindFirst.mockResolvedValue({
      id: "pub-draft",
      key: "instagram-2026-08-04-morning",
      planSlot: "instagram-2026-08-04-morning",
      scheduledFor: donorSlotAt,
    });

    const result = await deferPublicationToNextSlot({
      publication: approved,
      now: NOW,
      reason: "Канал был на паузе.",
      nextStatus: "SCHEDULED",
    });

    expect(result.deferred).toBe(true);
    expect(result.slot).toBe("instagram-2026-08-04-morning");
    expect(result.yieldedBy).toBe("instagram-2026-08-04-morning");

    // Донор обязан отпустить слот В ТОЙ ЖЕ транзакции, что и захват: слот
    // уникален в базе, и падение между двумя записями оставило бы его ничьим.
    expect(transaction).toHaveBeenCalledTimes(1);
    const [statements] = transaction.mock.calls[0] as [unknown[]];
    expect(statements).toHaveLength(2);
  });

  it("ищет донора только среди неутверждённых черновиков своей площадки", async () => {
    publicationFindMany.mockResolvedValue(everyFutureSlotTaken("instagram"));
    publicationFindFirst.mockResolvedValue(null);

    await deferPublicationToNextSlot({
      publication: approved,
      now: NOW,
      reason: "Канал был на паузе.",
      nextStatus: "SCHEDULED",
    });

    const [args] = publicationFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where.platform).toBe("instagram");
    expect(args.where.status).toBe("DRAFT");
    // Отметка редактора — та самая граница: утверждённый материал не сдвигается
    // никогда, иначе перенос одной строки поехал бы каскадом по всему плану.
    expect(args.where.agentReviewedAt).toBeNull();
  });

  it("без подходящего донора материал остаётся в очереди, а не архивируется", async () => {
    publicationFindMany.mockResolvedValue(everyFutureSlotTaken("instagram"));
    publicationFindFirst.mockResolvedValue(null);

    const result = await deferPublicationToNextSlot({
      publication: approved,
      now: NOW,
      reason: "Канал был на паузе.",
      nextStatus: "SCHEDULED",
    });

    expect(result.deferred).toBe(false);
    expect(result.reason).toBe("no-free-slot");
    expect(transaction).not.toHaveBeenCalled();
    expect(publicationUpdate).not.toHaveBeenCalled();
  });

  it("пока есть свободный слот, чужой никто не трогает", async () => {
    publicationFindMany.mockResolvedValue([]);

    const result = await deferPublicationToNextSlot({
      publication: approved,
      now: NOW,
      reason: "Канал был на паузе.",
      nextStatus: "SCHEDULED",
    });

    expect(result.deferred).toBe(true);
    expect(result.yieldedBy).toBeUndefined();
    expect(publicationFindFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
