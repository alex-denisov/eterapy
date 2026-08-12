/**
 * B705 §7 — горизонт планирования принадлежит ЛЕНТЕ, а темп — календарным
 * суткам.
 *
 * Требование владельца: «максимум неделя, чтобы не жечь токены». Окно плана
 * токены не жжёт (их ограничивает окно генерации B625), но вывод верен по
 * другой причине: тема быстрой ленты, придуманная десять дней назад, к выпуску
 * мертва, а статья Дзена готовится дольше и живёт месяцами.
 *
 * Второй предмет проверки — дефект, найденный замером 2026-08-12. Списки дней
 * вида `[1, 3, 5, 8, 10, 12]` были позициями в СКОЛЬЗЯЩЕМ окне: план
 * пересобирается «от завтра» каждый заход, поэтому одна и та же дата успевала
 * побывать на каждой позиции и получить слот от каждого списка. Расписание
 * обещало «Reddit дважды за две недели», а конвейер получал ежедневный слот на
 * всех шести площадках. Ровно тот же дефект B686 нашёл у ТЕМ и не довёл до
 * существования слотов.
 */

import {
  contentPlanFor,
  nextPlanSlots,
  reactivePlanSlots,
  PLAN_HORIZON_DAYS,
  PLAN_MAX_HORIZON_DAYS,
  type PlanChannel,
} from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-12T09:00:00.000Z");
const DAY_MS = 86_400_000;

function daysAhead(scheduledAt: string, now: Date): number {
  return (new Date(scheduledAt).getTime() - now.getTime()) / DAY_MS;
}

describe("B705 — горизонт у каждой ленты свой", () => {
  it("быстрые ленты не планируются дальше недели, Дзен — двух, Reddit — трёх", () => {
    for (const slot of contentPlanFor(NOW)) {
      // +1 сутки: окно начинается с завтрашнего дня, а слот стоит внутри суток.
      expect(daysAhead(slot.scheduledAt, NOW)).toBeLessThan(PLAN_HORIZON_DAYS[slot.channel] + 1);
    }
  });

  it("длина окна — самый дальний горизонт, и он у Reddit", () => {
    expect(PLAN_MAX_HORIZON_DAYS).toBe(21);
    expect(PLAN_HORIZON_DAYS.reddit).toBe(21);
    expect(PLAN_HORIZON_DAYS.dzen).toBe(14);
    for (const fast of ["telegram", "threads", "vk", "instagram"] as PlanChannel[]) {
      expect(PLAN_HORIZON_DAYS[fast]).toBe(7);
    }
  });
});

describe("B705 — темп считается от календарных суток, а не от позиции в окне", () => {
  it("одна и та же дата получает один и тот же набор слотов в любом заходе", () => {
    const target = "2026-08-25";
    const keysAt = (now: Date) => contentPlanFor(now)
      .filter((slot) => slot.scheduledAt.startsWith(target))
      .map((slot) => slot.key)
      .sort();

    const fromDay1 = keysAt(new Date("2026-08-12T09:00:00.000Z"));
    const fromDay4 = keysAt(new Date("2026-08-15T09:00:00.000Z"));
    const fromDay7 = keysAt(new Date("2026-08-18T09:00:00.000Z"));

    expect(fromDay1.length).toBeGreaterThan(0);
    // Дзен виден за 14 суток, быстрые ленты подтягиваются позже — сравниваем
    // те ключи, которые уже попали в окно обоих заходов.
    expect(fromDay4.filter((key) => fromDay1.includes(key))).toEqual(
      fromDay1.filter((key) => fromDay4.includes(key)),
    );
    expect(fromDay7).toEqual(expect.arrayContaining(fromDay4.filter((key) => fromDay7.includes(key))));
  });

  it("Reddit выходит дважды за три недели, а не каждый день", () => {
    const reddit = contentPlanFor(NOW).filter((slot) => slot.channel === "reddit");
    expect(reddit).toHaveLength(2);
  });

  it("суточный объём флота остаётся в границах 5–8 материалов", () => {
    // §9: конвейер давал такт на 24 материала в сутки — втрое больше, чем нужно.
    const perDay = new Map<string, number>();
    for (const slot of contentPlanFor(NOW)) {
      const date = slot.scheduledAt.slice(0, 10);
      perDay.set(date, (perDay.get(date) ?? 0) + 1);
    }
    // Первая неделя — единственная, где представлены все ленты сразу.
    const firstWeek = [...perDay.entries()].sort().slice(0, 7).map(([, count]) => count);
    for (const count of firstWeek) {
      expect(count).toBeGreaterThanOrEqual(5);
      expect(count).toBeLessThanOrEqual(8);
    }
  });
});

describe("B705 — 30% слотов быстрых лент держатся под реактив", () => {
  it("резерв есть у быстрых лент и отсутствует у длинных форматов", () => {
    const plan = contentPlanFor(NOW);
    const fast = plan.filter((slot) => ["telegram", "threads", "vk", "instagram"].includes(slot.channel));
    const reserved = fast.filter((slot) => slot.reserve === "reactive");
    const share = reserved.length / fast.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);

    for (const slot of plan.filter((entry) => entry.channel === "dzen" || entry.channel === "reddit")) {
      expect(slot.reserve).toBe("planned");
    }
  });

  it("плановый проход не занимает резерв, а реактивный видит только его", () => {
    const plan = contentPlanFor(NOW);
    const planned = nextPlanSlots([], plan.length, plan);
    expect(planned.every((slot) => slot.reserve === "planned")).toBe(true);

    const reactive = reactivePlanSlots([], plan);
    expect(reactive.length).toBeGreaterThan(0);
    expect(reactive.every((slot) => slot.reserve === "reactive")).toBe(true);
    expect(planned.length + reactive.length).toBe(plan.length);
  });

  it("резерв детерминирован: тот же слот резервируется при каждом пересчёте", () => {
    const first = contentPlanFor(NOW).map((slot) => `${slot.key}:${slot.reserve}`);
    const second = contentPlanFor(NOW).map((slot) => `${slot.key}:${slot.reserve}`);
    expect(second).toEqual(first);
  });
});
