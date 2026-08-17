/**
 * B713 §4 — темп плана: вечерний слот Telegram и снятый резерв.
 *
 * ЧТО НАШЁЛ ЗАМЕР. `publish-windows.ts` знает у Telegram три времени суток —
 * 08:30, 13:00 и 20:30 МСК. План при этом выдавал ДВА слота в сутки, и третья
 * строка (`…-telegram-…-03`) каждые сутки снималась гигиеной очереди с
 * причиной «Слот снят из контент-плана, текста на складе нет». За 03.08–17.08
 * так снялось 72 строки — больше, чем по любой другой причине.
 *
 * То есть расписание в окнах публикации и расписание в плане РАЗОШЛИСЬ, и
 * разошлись молча: владелец видел «постов стало реже», а система считала, что
 * работает штатно.
 *
 * Решение владельца 2026-08-17: Telegram 3 слота в сутки, резерв снять.
 *
 * ПРО РЕЗЕРВ. 30% слотов быстрых лент помечались `reactive` и оставались
 * пустыми под реакцию на события. Реактивного потока за две недели не
 * появилось ни одного материала, то есть каждая третья возможность выпуска
 * просто не использовалась. Механизм НЕ удаляется — он понадобится, когда
 * реактивный контур заработает; доля выставлена в ноль, и это решение, а не
 * пропажа кода.
 */

import {
  contentPlanFor,
  nextPlanSlots,
  reactivePlanSlots,
  type PlanChannel,
} from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-17T09:00:00Z");

function slotsOn(date: string, channel: PlanChannel) {
  return contentPlanFor(NOW)
    .filter((slot) => slot.channel === channel && slot.scheduledAt.startsWith(date));
}

describe("B713 — вечерний слот Telegram вернулся в план", () => {
  it("у Telegram три слота в сутки, а не два", () => {
    // Берём сутки внутри горизонта, но не сегодняшние: у сегодняшних часть
    // слотов уже в прошлом и в план не попадает.
    const counts = ["2026-08-19", "2026-08-20", "2026-08-21"]
      .map((date) => slotsOn(date, "telegram").length);
    expect(counts).toEqual([3, 3, 3]);
  });

  it("третий слот встаёт на вечернее время, а не дублирует утро", () => {
    const times = slotsOn("2026-08-19", "telegram")
      .map((slot) => slot.scheduledAt)
      .sort();
    expect(new Set(times).size).toBe(3);
  });
});

describe("B713 — резерв снят до появления реактивного потока", () => {
  it("быстрые ленты больше не держат пустых слотов", () => {
    const plan = contentPlanFor(NOW);
    const fast = plan.filter((slot) =>
      (["telegram", "threads", "vk", "instagram"] as PlanChannel[]).includes(slot.channel));
    expect(fast.length).toBeGreaterThan(0);
    expect(fast.every((slot) => slot.reserve === "planned")).toBe(true);
  });

  it("плановый проход видит весь план целиком", () => {
    const plan = contentPlanFor(NOW);
    const planned = nextPlanSlots([], plan.length, plan);
    expect(planned.length).toBe(plan.length);
    expect(reactivePlanSlots([], plan)).toHaveLength(0);
  });
});
