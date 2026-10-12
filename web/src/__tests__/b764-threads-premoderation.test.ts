/** B764 — премодерация каждого поста Threads: ожидание, привязка комментария к карточке, вердикты, слот. */
process.env.MARKETING_MODERATION_SECRET = "test-secret";

type Row = Record<string, unknown>;
const settings = new Map<string, string>();
const rows = new Map<string, Row>();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    platformSetting: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) => (
        settings.has(where.key) ? { value: settings.get(where.key) } : null
      )),
      findMany: jest.fn(async ({ where }: { where: { key: { startsWith: string } } }) => (
        [...settings.entries()].filter(([key]) => key.startsWith(where.key.startsWith)).map(([, value]) => ({ value }))
      )),
      deleteMany: jest.fn(async ({ where }: { where: { key: string } }) => { settings.delete(where.key); }),
      upsert: jest.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        settings.set(where.key, create.value);
      }),
    },
    externalPublication: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; status?: string }; data: Row }) => {
        const row = rows.get(where.id);
        if (!row || (where.status && row.status !== where.status)) return { count: 0 };
        rows.set(where.id, { ...row, ...data });
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        rows.set(where.id, { ...(rows.get(where.id) ?? {}), ...data });
      }),
      findMany: jest.fn(async () => [...rows.values()].filter((row) => ["SCHEDULED", "MANUAL"].includes(String(row.status)))),
    },
  },
}));
jest.mock("@/lib/ai", () => ({
  aiComplete: jest.fn(async () => ({ text: '{"mode":"patch","instructions":"смени концовку"}' })),
}));
jest.mock("@/lib/telegram", () => ({
  sendTelegram: jest.fn(async () => 777),
  callTelegramApi: jest.fn(async () => ({})),
}));
jest.mock("@/lib/ops-notification-channel", () => ({
  marketingDeliveryTargets: jest.fn(async () => ["-100"]),
  moderationChatIds: jest.fn(async () => ["-100"]),
  resolveMarketingChannel: jest.fn(async () => ({ chatIds: ["-100"], source: "test" })),
}));

import { handleOwnerReason, reworkThreadsPost } from "@/lib/marketing/owner-review";
import { isAwaitingThreadsOwner, isThreadsPlanPost } from "@/lib/marketing/owner-review-state";
import { OWNER_IDEA_SOURCE } from "@/lib/marketing/owner-ideas";
import {
  parseThreadsCallback,
  threadsApprovalSlot,
  threadsCallback,
  threadsCardKeyboard,
  rejectTagsKeyboard,
} from "@/lib/marketing/moderation";
import {
  exemplarIds,
  groupVerdicts,
  pickPending,
  putPending,
  readPending,
  readThreadsVerdicts,
  setOwnerRating,
  toggleTag,
  type PendingReason,
  type ThreadsVerdict,
} from "@/lib/marketing/threads-verdicts";

const NOW = new Date("2026-10-12T10:00:00.000Z");

function reviewRow(id: string, extra: Row = {}): Row {
  return {
    id,
    platform: "threads",
    contentType: "POST",
    source: "content-plan",
    status: "REVIEW",
    body: "Текст поста",
    cluster: "бывшие",
    notes: JSON.stringify({ format: "scene", editorialAngle: "угол", ownerRating: 6 }),
    agentWriterProvider: "luna",
    agentWriterModel: "deepseek-v4.1-flash",
    scheduledFor: new Date(NOW.getTime() + 3_600_000),
    ...extra,
  };
}

function pending(id: string, card: number, extra: Partial<PendingReason> = {}): PendingReason {
  return {
    publicationId: id,
    action: "reject",
    chatId: "-100",
    cardMessageId: card,
    promptMessageId: card + 1,
    tags: [],
    at: NOW.toISOString(),
    ...extra,
  };
}

beforeEach(() => {
  settings.clear();
  rows.clear();
});

describe("кто проходит владельца", () => {
  it("плановый пост Threads — да; идея владельца, комментарий и другие площадки — нет", () => {
    expect(isThreadsPlanPost({ platform: "threads", contentType: "POST", source: "content-plan" })).toBe(true);
    expect(isThreadsPlanPost({ platform: "Threads", contentType: "post", source: null })).toBe(true);
    expect(isThreadsPlanPost({ platform: "threads", contentType: "POST", source: OWNER_IDEA_SOURCE })).toBe(false);
    expect(isThreadsPlanPost({ platform: "threads", contentType: "COMMENT", source: null })).toBe(false);
    expect(isThreadsPlanPost({ platform: "vk", contentType: "POST", source: null })).toBe(false);
  });

  it("гигиена не видит ждущий владельца пост: только REVIEW и только Threads", () => {
    expect(isAwaitingThreadsOwner({ platform: "threads", contentType: "POST", source: null, status: "REVIEW" })).toBe(true);
    expect(isAwaitingThreadsOwner({ platform: "threads", contentType: "POST", source: null, status: "DRAFT" })).toBe(false);
    expect(isAwaitingThreadsOwner({ platform: "vk", contentType: "POST", source: null, status: "REVIEW" })).toBe(false);
  });
});

describe("комментарий уходит к своей карточке", () => {
  const two = [pending("pub-aaaaaaaa", 100), pending("pub-bbbbbbbb", 200)];

  it("reply на карточку и на подсказку бота выбирают свою публикацию", () => {
    expect(pickPending(two, "-100", 200, NOW)).toEqual({ kind: "found", entry: two[1] });
    expect(pickPending(two, "-100", 101, NOW)).toEqual({ kind: "found", entry: two[0] });
  });

  it("без reply при двух ожиданиях гадать нельзя", () => {
    expect(pickPending(two, "-100", null, NOW)).toEqual({ kind: "ambiguous", count: 2 });
  });

  it("обычное сообщение привязывается только к свежему единственному ожиданию", () => {
    expect(pickPending([two[0]], "-100", null, NOW).kind).toBe("found");
    const late = new Date(NOW.getTime() + 11 * 60_000);
    expect(pickPending([two[0]], "-100", null, late).kind).toBe("none");
    expect(pickPending([two[0]], "-999", null, NOW).kind).toBe("none");
  });

  it("handleOwnerReason: комментарий-reply меняет только свою карточку", async () => {
    rows.set("pub-aaaaaaaa", reviewRow("pub-aaaaaaaa"));
    rows.set("pub-bbbbbbbb", reviewRow("pub-bbbbbbbb"));
    await putPending(pending("pub-aaaaaaaa", 100, { action: "revise" }), NOW);
    await putPending(pending("pub-bbbbbbbb", 200, { action: "revise" }), NOW);

    const reply = await handleOwnerReason({ text: "концовка слабая", chatId: "-100", now: NOW, replyToMessageId: 200 });

    expect(reply).toContain("Принял");
    expect(rows.get("pub-bbbbbbbb")?.status).toBe("DRAFT");
    expect(rows.get("pub-aaaaaaaa")?.status).toBe("REVIEW");
    expect((await readPending(NOW)).map((entry) => entry.publicationId)).toEqual(["pub-aaaaaaaa"]);
  });

  it("reply на постороннее сообщение комментарием к карточке не считается", () => {
    expect(pickPending([two[0]], "-100", 999, NOW)).toEqual({ kind: "none" });
  });

  it("двойное «Отправить отказ» не плодит вердиктов", async () => {
    rows.set("pub-aaaaaaaa", reviewRow("pub-aaaaaaaa"));
    const entry = pending("pub-aaaaaaaa", 100);
    await reworkThreadsPost({ entry, comment: null, now: NOW });
    expect(await reworkThreadsPost({ entry, comment: null, now: NOW })).toBeNull();
    expect(await readThreadsVerdicts()).toHaveLength(1);
  });

  it("не reply при двух ожиданиях не перехватывает диалог", async () => {
    await putPending(pending("pub-aaaaaaaa", 100), NOW);
    await putPending(pending("pub-bbbbbbbb", 200), NOW);
    expect(await handleOwnerReason({ text: "привет", chatId: "-100", now: NOW, replyToMessageId: null })).toBeNull();
  });
});

describe("отказ и доработка", () => {
  it("отказ с тегами и текстом: пост НЕ архивируется, идёт автору заново, причина и вердикт сохранены", async () => {
    rows.set("pub-aaaaaaaa", reviewRow("pub-aaaaaaaa"));
    await setOwnerRating("pub-aaaaaaaa", 6);
    await putPending(pending("pub-aaaaaaaa", 100, { tags: ["incoherent", "not_funny"] }), NOW);

    const reply = await reworkThreadsPost({ entry: pending("pub-aaaaaaaa", 100, { tags: ["incoherent", "not_funny"] }), comment: "рвётся на втором предложении", now: NOW });

    expect(reply).toContain("Принял");
    const row = rows.get("pub-aaaaaaaa") as Row;
    expect(row.status).toBe("DRAFT");
    expect(row.status).not.toBe("ARCHIVED");
    const notes = JSON.parse(String(row.notes));
    expect(notes.editorialAngle).toContain("несвязно, не смешно");
    expect(notes.editorialAngle).toContain("рвётся на втором предложении");
    expect(notes.editorialAngle).toContain("контрпример");
    expect(notes.rounds).toBe(1);

    const [verdict] = await readThreadsVerdicts();
    expect(verdict).toMatchObject({
      publicationId: "pub-aaaaaaaa",
      decision: "reject",
      tags: ["incoherent", "not_funny"],
      rating: 6,
      writerModel: "deepseek-v4.1-flash",
      format: "scene",
      cluster: "бывшие",
    });
    expect(await readPending(NOW)).toHaveLength(0);
  });

  it("доработка: классификатор выбирает точечную правку, текст прежней версии передан автору", async () => {
    rows.set("pub-aaaaaaaa", reviewRow("pub-aaaaaaaa"));
    await reworkThreadsPost({ entry: pending("pub-aaaaaaaa", 100, { action: "revise" }), comment: "концовка слабая", now: NOW });
    const notes = JSON.parse(String((rows.get("pub-aaaaaaaa") as Row).notes));
    expect(notes.editorialAngle).toContain("ПРАВКА ВЛАДЕЛЬЦА (точечно)");
    expect(notes.editorialAngle).toContain("Текст поста");
  });

  it("после трёх кругов пост остаётся в очереди, а не уходит в архив", async () => {
    rows.set("pub-aaaaaaaa", reviewRow("pub-aaaaaaaa", { notes: JSON.stringify({ rounds: 3, editorialAngle: "угол" }) }));
    const reply = await reworkThreadsPost({ entry: pending("pub-aaaaaaaa", 100), comment: "опять не то", now: NOW });
    expect(reply).toContain("остаётся в очереди");
    expect((rows.get("pub-aaaaaaaa") as Row).status).toBe("REVIEW");
  });

  it("решённая или чужая строка снимает ожидание и ничего не пишет", async () => {
    rows.set("pub-aaaaaaaa", reviewRow("pub-aaaaaaaa", { status: "SCHEDULED" }));
    await putPending(pending("pub-aaaaaaaa", 100), NOW);
    expect(await reworkThreadsPost({ entry: pending("pub-aaaaaaaa", 100), comment: "x", now: NOW })).toBeNull();
    expect(await readPending(NOW)).toHaveLength(0);
    expect(await readThreadsVerdicts()).toHaveLength(0);
  });
});

describe("слот не сгорает", () => {
  it("будущий слот сохраняется", async () => {
    const at = new Date(NOW.getTime() + 2 * 3_600_000);
    expect(await threadsApprovalSlot({ platform: "threads", scheduledFor: at }, NOW)).toEqual(at);
  });

  it("закрывшееся окно переносится на свободный слот, не на занятый", async () => {
    const stale = new Date(NOW.getTime() - 5 * 3_600_000);
    const first = await threadsApprovalSlot({ platform: "threads", scheduledFor: stale }, NOW);
    expect(first.getTime()).toBeGreaterThan(NOW.getTime());
    rows.set("busy", { id: "busy", status: "SCHEDULED", scheduledFor: first });
    const second = await threadsApprovalSlot({ platform: "threads", scheduledFor: stale }, NOW);
    expect(Math.abs(second.getTime() - first.getTime())).toBeGreaterThanOrEqual(20 * 60_000);
  });
});

describe("кнопки и подписи", () => {
  it("карточка: три решения, оценка 1–10 и «Убрать»", () => {
    const buttons = threadsCardKeyboard("pub-aaaaaaaa").inline_keyboard.flat().map((button) => button.text);
    expect(buttons).toEqual(expect.arrayContaining(["✅ Публиковать", "✍️ Доработать", "⛔ Отказать", "1", "10"]));
    expect(buttons.filter((text) => /^\d+$/.test(text))).toHaveLength(10);
  });

  it("выбранная оценка и выбранные теги отмечены", () => {
    expect(threadsCardKeyboard("pub-aaaaaaaa", 7).inline_keyboard.flat().map((b) => b.text)).toContain("● 7");
    const tags = rejectTagsKeyboard("pub-aaaaaaaa", ["not_funny"]).inline_keyboard.flat().map((b) => b.text);
    expect(tags).toContain("✓ не смешно");
    expect(tags).toContain("несвязно");
  });

  it("каждая кнопка укладывается в 64 байта и проходит проверку подписи; подделка нет", () => {
    for (const button of [...threadsCardKeyboard("cmabcdefghij1234567890xyz").inline_keyboard.flat(), ...rejectTagsKeyboard("cmabcdefghij1234567890xyz", []).inline_keyboard.flat()]) {
      expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
    }
    const data = threadsCallback("smt", "3", "pub-aaaaaaaa");
    expect(parseThreadsCallback(data)).toEqual({ prefix: "smt", arg: "3", publicationId: "pub-aaaaaaaa" });
    expect(parseThreadsCallback(data.replace(":3:", ":4:"))).toBeNull();
    expect(parseThreadsCallback(data.replace("pub-aaaaaaaa", "pub-bbbbbbbb"))).toBeNull();
  });

  it("теги переключаются", () => {
    expect(toggleTag([], "incoherent")).toEqual(["incoherent"]);
    expect(toggleTag(["incoherent"], "incoherent")).toEqual([]);
  });
});

describe("выгрузка вердиктов", () => {
  const base: ThreadsVerdict = {
    at: NOW.toISOString(), publicationId: "p", decision: "approve", rating: null, tags: [], comment: null,
    writerProvider: "luna", writerModel: "m1", format: "scene", cluster: "c", technique: null,
    lifeArea: null, fact: null, instructionVersion: null, round: 1,
  };

  it("считает принятые, отказы, доработки и среднюю оценку по модели", () => {
    const groups = groupVerdicts([
      { ...base, rating: 9 },
      { ...base, decision: "reject", tags: ["not_funny"], rating: 3 },
      { ...base, decision: "revise" },
      { ...base, writerModel: "m2", rating: 8 },
    ], "writerModel");
    expect(groups[0]).toMatchObject({ key: "m1", decisions: 3, approved: 1, rejected: 1, revised: 1, avgRating: 6 });
    expect(groups[1]).toMatchObject({ key: "m2", approved: 1, avgRating: 8 });
  });

  it("эталоны — одобренное с оценкой ≥ 9; контрпримеры — отказы с причиной", () => {
    const result = exemplarIds([
      { ...base, publicationId: "good", rating: 9 },
      { ...base, publicationId: "meh", rating: 7 },
      { ...base, publicationId: "bad", decision: "reject", tags: ["incoherent"] },
      { ...base, publicationId: "bare", decision: "reject" },
    ]);
    expect(result).toEqual({ good: ["good"], bad: ["bad"] });
  });
});

describe("текстовая выгрузка", () => {
  it("печатает группы и причины отказов; пустой журнал говорит об этом прямо", () => {
    const { renderVerdictReport } = jest.requireActual("@/lib/marketing/threads-verdicts") as typeof import("@/lib/marketing/threads-verdicts");
    expect(renderVerdictReport([])).toContain("пока нет");
    const text = renderVerdictReport([{
      at: NOW.toISOString(), publicationId: "p", decision: "reject", rating: 2, tags: ["not_funny"], comment: null,
      writerProvider: "luna", writerModel: "m1", format: "scene", cluster: "c", technique: null,
      lifeArea: null, fact: null, instructionVersion: null, round: 1,
    }]);
    expect(text).toContain("## Модель автора");
    expect(text).toContain("m1: решений 1");
    expect(text).toContain("не смешно: 1");
  });
});
