/**
 * B705 — сторож очереди публикаций.
 *
 * Случаи взяты с прода 2026-08-12, не выдуманы:
 *  - 13 строк с `scheduled_for IS NULL`, старейшая от 28.07;
 *  - ответ человеку в VK от 01.08 ждёт кнопки владельца одиннадцать суток
 *    (`telegram_review_message_id = 1143`, `moderation_decision_at` пуст);
 *  - 117 черновиков стоят на слотах прежнего темпа, из них написано пять;
 *  - две статьи Дзена выпущены 06.08, а плановая дата у них в будущем.
 */

import {
  planQueueHygiene,
  PREMODERATION_STALE_MS,
  type QueueRow,
} from "@/lib/marketing/queue-hygiene";
import { contentPlanFor, type ContentPlanSlot } from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-12T13:00:00.000Z");
const PLAN = contentPlanFor(NOW);

function row(patch: Partial<QueueRow> & { id: string }): QueueRow {
  return {
    platform: "telegram",
    status: "DRAFT",
    contentType: "POST",
    scheduledFor: new Date("2026-08-14T09:00:00.000Z"),
    publishedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    planSlot: null,
    hasDraftText: false,
    telegramReviewMessageId: null,
    moderationDecisionAt: null,
    ...patch,
  };
}

/** Свободный слот площадки внутри действующего плана. */
function freeSlot(channel: string): ContentPlanSlot {
  const slot = PLAN.find((entry) => entry.channel === channel && entry.reserve === "planned");
  if (!slot) throw new Error(`нет планового слота площадки ${channel}`);
  return slot;
}

describe("B705 — пустая плановая дата", () => {
  it("черновик без даты и без текста снимается, а не считается срочным вечно", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      plan: PLAN,
      rows: [row({ id: "empty", scheduledFor: null, planSlot: null })],
    });
    expect(actions).toEqual([
      expect.objectContaining({ kind: "retire", id: "empty" }),
    ]);
  });

  it("написанный материал без даты получает ближайший слот своей площадки", () => {
    const { actions, unplaced } = planQueueHygiene({
      now: NOW,
      plan: PLAN,
      rows: [row({ id: "written", scheduledFor: null, hasDraftText: true })],
    });
    const scheduled = actions.find((action) => action.kind === "schedule");
    expect(scheduled).toBeDefined();
    expect(unplaced).toEqual([]);
    if (scheduled?.kind !== "schedule") throw new Error("ожидалось назначение слота");
    expect(scheduled.planSlot).toBe(freeSlot("telegram").key);
    expect(scheduled.scheduledFor.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("материал чужой площадки не занимает слот соседней ленты", () => {
    // Материал написан под контракт СВОЕЙ ленты; перенос в другую — брак.
    const dzenOnly = PLAN.filter((slot) => slot.channel === "dzen");
    const { actions, unplaced } = planQueueHygiene({
      now: NOW,
      plan: dzenOnly,
      rows: [row({ id: "tg", scheduledFor: null, hasDraftText: true })],
    });
    expect(actions).toEqual([]);
    expect(unplaced).toEqual(["tg"]);
  });
});

describe("B705 — залипшая премодерация", () => {
  const pending = (hoursAgo: number) => row({
    id: "reply",
    platform: "vk",
    status: "REVIEW",
    contentType: "INBOUND_REPLY",
    telegramReviewMessageId: 1143,
    moderationDecisionAt: null,
    scheduledFor: new Date(NOW.getTime() - hoursAgo * 3_600_000),
  });

  it("ответ, простоявший больше двух суток, закрывается как протухший", () => {
    const { actions } = planQueueHygiene({ now: NOW, plan: PLAN, rows: [pending(11 * 24)] });
    const expired = actions.find((action) => action.kind === "expireModeration");
    expect(expired).toBeDefined();
    // Виновата очередь, а не редактура: материал браком не признан.
    expect(expired?.reason).toContain("браком не признан");
  });

  it("свежая премодерация не трогается", () => {
    const fresh = pending(PREMODERATION_STALE_MS / 3_600_000 - 1);
    expect(planQueueHygiene({ now: NOW, plan: PLAN, rows: [fresh] }).actions).toEqual([]);
  });

  it("отвеченная премодерация не трогается, сколько бы ни прошло", () => {
    const answered = { ...pending(30 * 24), moderationDecisionAt: new Date("2026-08-02T00:00:00.000Z") };
    expect(planQueueHygiene({ now: NOW, plan: PLAN, rows: [answered] }).actions).toEqual([]);
  });
});

describe("B705 — строки вне действующего плана", () => {
  it("пустая оболочка за горизонтом площадки снимается", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      plan: PLAN,
      rows: [row({
        id: "far",
        planSlot: "b610-2w-telegram-20260826-01",
        scheduledFor: new Date("2026-08-26T14:30:00.000Z"),
      })],
    });
    expect(actions[0]).toMatchObject({ kind: "retire", id: "far" });
    expect(actions[0].reason).toContain("горизонт");
  });

  it("написанное за горизонтом переносится на ближний слот, а не выбрасывается", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      plan: PLAN,
      rows: [row({
        id: "far-written",
        hasDraftText: true,
        planSlot: "b610-2w-telegram-20260826-01",
        scheduledFor: new Date("2026-08-26T14:30:00.000Z"),
      })],
    });
    expect(actions[0]).toMatchObject({ kind: "schedule", id: "far-written" });
  });

  it("утверждённая строка с живой датой остаётся на своём времени", () => {
    // Её уже ждут: перенос сдвинул бы обещанное время выпуска.
    const approved = row({
      id: "scheduled",
      status: "SCHEDULED",
      planSlot: "b610-2w-telegram-20260813-99",
      scheduledFor: new Date("2026-08-13T14:30:00.000Z"),
    });
    expect(planQueueHygiene({ now: NOW, plan: PLAN, rows: [approved] }).actions).toEqual([]);
  });

  it("написанное занимает слот раньше утверждённого без даты", () => {
    // У написанного уже потрачен круг автора — оно ближе к выпуску.
    const { actions } = planQueueHygiene({
      now: NOW,
      plan: PLAN,
      rows: [
        row({ id: "approved", status: "MANUAL", scheduledFor: null }),
        row({ id: "written", hasDraftText: true, scheduledFor: null }),
      ],
    });
    const order = actions.filter((action) => action.kind === "schedule").map((action) => action.id);
    expect(order).toEqual(["written", "approved"]);
  });

  it("свободный слот не достаётся двум материалам", () => {
    const single = [freeSlot("telegram")];
    const { actions, unplaced } = planQueueHygiene({
      now: NOW,
      plan: single,
      rows: [
        row({ id: "a", hasDraftText: true, scheduledFor: null }),
        row({ id: "b", hasDraftText: true, scheduledFor: null }),
      ],
    });
    expect(actions.filter((action) => action.kind === "schedule")).toHaveLength(1);
    expect(unplaced).toEqual(["b"]);
  });

  it("снятая оболочка освобождает свой слот для написанного материала", () => {
    const slot = freeSlot("telegram");
    const { actions } = planQueueHygiene({
      now: NOW,
      plan: [slot],
      rows: [
        // Оболочка занимает слот, но её собственная дата ушла за горизонт.
        row({ id: "shell", planSlot: slot.key, scheduledFor: new Date("2026-09-30T09:00:00.000Z") }),
        row({ id: "written", hasDraftText: true, scheduledFor: null }),
      ],
    });
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "retire", id: "shell" }),
      expect.objectContaining({ kind: "schedule", id: "written", planSlot: slot.key }),
    ]));
  });
});

describe("B705 — выпущенное с будущей плановой датой", () => {
  it("дозапись задним числом приводится к фактическому выпуску", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      plan: PLAN,
      rows: [row({
        id: "dzen-backfill",
        platform: "dzen",
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-06T00:20:00.000Z"),
        scheduledFor: new Date("2026-08-14T03:30:00.000Z"),
      })],
    });
    expect(actions).toEqual([
      expect.objectContaining({ kind: "alignPublished", id: "dzen-backfill" }),
    ]);
    const [action] = actions;
    if (action.kind !== "alignPublished") throw new Error("ожидалось выравнивание даты");
    expect(action.scheduledFor.toISOString()).toBe("2026-08-06T00:20:00.000Z");
  });

  it("нормально выпущенная строка не трогается", () => {
    const published = row({
      id: "ok",
      status: "PUBLISHED",
      publishedAt: new Date("2026-08-10T09:05:00.000Z"),
      scheduledFor: new Date("2026-08-10T09:00:00.000Z"),
    });
    expect(planQueueHygiene({ now: NOW, plan: PLAN, rows: [published] }).actions).toEqual([]);
  });
});

describe("B705 — чего сторож не делает", () => {
  it("разговорный материал не переносится по слотам плана", () => {
    // У ответа человеку нет слота: он привязан к чужой реплике, а не к плану.
    const reply = row({
      id: "comment",
      contentType: "COMMENT",
      scheduledFor: null,
      hasDraftText: true,
    });
    expect(planQueueHygiene({ now: NOW, plan: PLAN, rows: [reply] }).actions).toEqual([]);
  });

  it("выпущенное и снятое в архив остаётся нетронутым", () => {
    const rows = [
      row({ id: "archived", status: "ARCHIVED", scheduledFor: null }),
      row({ id: "failed", status: "FAILED", scheduledFor: null }),
    ];
    expect(planQueueHygiene({ now: NOW, plan: PLAN, rows }).actions).toEqual([]);
  });

  it("незнакомая площадка не получает выдуманного горизонта", () => {
    // §14: запасной контракт обязан быть проницаемым. У площадки без плейбука
    // горизонта нет, поэтому дальняя дата сама по себе ничего не решает —
    // написанный материал такой площадки уходит в `unplaced`, а не в архив.
    const written = row({
      id: "alien-written",
      platform: "pikabu",
      hasDraftText: true,
      planSlot: "pikabu-manual-01",
      scheduledFor: new Date("2026-12-01T09:00:00.000Z"),
    });
    const { actions, unplaced } = planQueueHygiene({ now: NOW, plan: PLAN, rows: [written] });
    expect(actions).toEqual([]);
    expect(unplaced).toEqual(["alien-written"]);
  });
});
