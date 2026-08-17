/**
 * B713 §4a — строка, снятая ЗА ОТСУТСТВИЕ СЛОТА, не имеет права держать слот.
 *
 * НАЙДЕНО ПРОВЕРКОЙ ПОСЛЕ ВЫКАТКИ, а не рассуждением. Темп Telegram подняли до
 * трёх слотов в сутки, выкатили — и вечерний слот не появился ни на одной из
 * десяти дат горизонта. Причина: `-03` на каждую дату уже лежал в реестре
 * `ARCHIVED` с причиной «слот снят из контент-плана», а `plan_slot` уникален и
 * остался на снятой строке.
 *
 * Дальше две шестерёнки заклинивают друг друга:
 *
 *   `publication-queue` считает слот занятым по ЛЮБОМУ статусу строки, значит
 *   `nextPlanSlots` его не отдаёт;
 *   даже если бы отдал, `create` с тем же `planSlot` упал бы на unique.
 *
 * То есть правка темпа выглядела выполненной и не давала НИЧЕГО — ровно тот
 * класс, который ловится только проверкой на живой базе.
 *
 * ⚠ ГРАНИЦА ПРАВИЛА УЗКАЯ. Слот освобождает только снятие ПО ПРИЧИНЕ «слота
 * нет в плане»: такая строка никогда не была законным владельцем слота. Строка,
 * умершая по решению редактора или по safety-флагу, слот держит — там материал
 * признан негодным по существу, и право слота на перевыпуск считает бюджет
 * поколений (B643), а не этот сторож.
 */

import { planQueueHygiene } from "@/lib/marketing/queue-hygiene";
import { contentPlanFor } from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-17T12:00:00Z");

function row(over: Record<string, unknown> = {}) {
  return {
    id: "orphan",
    platform: "telegram",
    status: "DRAFT",
    contentType: "POST",
    scheduledFor: new Date("2026-08-25T17:30:00Z"),
    publishedAt: null,
    createdAt: new Date("2026-08-10T00:00:00Z"),
    // Слота с таким ключом в действующем плане нет.
    planSlot: "b610-2w-telegram-20260825-99",
    hasDraftText: false,
    telegramReviewMessageId: null,
    moderationDecisionAt: null,
    ...over,
  };
}

describe("B713 — снятая за отсутствие слота строка отпускает слот", () => {
  it("снятие несёт признак освобождения слота", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      rows: [row()],
      plan: contentPlanFor(NOW),
    });
    const retire = actions.find((action) => action.id === "orphan" && action.kind === "retire");
    expect(retire).toBeDefined();
    expect(retire && "releaseSlot" in retire && retire.releaseSlot).toBe(true);
  });

  it("снятие протухшей премодерации слот НЕ отпускает", () => {
    const { actions } = planQueueHygiene({
      now: NOW,
      rows: [row({
        id: "stale-review",
        status: "REVIEW",
        contentType: "INBOUND_REPLY",
        telegramReviewMessageId: 42,
        scheduledFor: new Date("2026-08-10T00:00:00Z"),
      })],
      plan: contentPlanFor(NOW),
    });
    const expired = actions.find((action) => action.id === "stale-review");
    expect(expired?.kind).toBe("expireModeration");
    expect(expired && "releaseSlot" in expired).toBe(false);
  });
});
