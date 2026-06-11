import { STREAK_REWARDS, milestoneRewardFor } from "@/lib/streaks";
import { buildDeterministicWeeklySummary, practiceWeekDays, startOfPracticeWeek } from "@/lib/weekly-summary";

describe("B375 — награды по вехам вместо +1/день", () => {
  it("схема вех: 3 дня +1, 7 +2, 14 +2, 30 +3", () => {
    expect(STREAK_REWARDS[3]?.creditAmount).toBe(1);
    expect(STREAK_REWARDS[7]?.creditAmount).toBe(2);
    expect(STREAK_REWARDS[14]?.creditAmount).toBe(2);
    expect(STREAK_REWARDS[30]?.creditAmount).toBe(3);
    // Старая ежедневная единица и сторонние награды убраны из схемы.
    expect(Object.keys(STREAK_REWARDS).sort((a, b) => Number(a) - Number(b))).toEqual(["3", "7", "14", "30"]);
  });

  it("milestoneRewardFor: награда только на граничных днях", () => {
    expect(milestoneRewardFor(1)).toBeNull();
    expect(milestoneRewardFor(2)).toBeNull();
    expect(milestoneRewardFor(3)?.creditAmount).toBe(1);
    expect(milestoneRewardFor(4)).toBeNull();
    expect(milestoneRewardFor(7)?.creditAmount).toBe(2);
    expect(milestoneRewardFor(14)?.creditAmount).toBe(2);
    expect(milestoneRewardFor(15)).toBeNull();
    expect(milestoneRewardFor(30)?.creditAmount).toBe(3);
  });

  it("разрыв серии: после сброса счёт начинается с 1 и веха достигается заново", () => {
    // bumpPracticeStreak сбрасывает count→1 при пропуске дня (логика в БД-транзакции);
    // здесь фиксируем контракт схемы: день 1 и 2 после разрыва наград не дают.
    expect(milestoneRewardFor(1)).toBeNull();
    expect(milestoneRewardFor(3)).not.toBeNull();
  });
});

describe("B375 — недельный прогресс и итог недели", () => {
  it("startOfPracticeWeek — понедельник UTC", () => {
    // 2026-06-11 — четверг; неделя начинается 2026-06-08 (понедельник).
    expect(startOfPracticeWeek(new Date("2026-06-11T15:00:00Z")).toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(startOfPracticeWeek(new Date("2026-06-08T00:00:00Z")).toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(startOfPracticeWeek(new Date("2026-06-14T23:59:59Z")).toISOString()).toBe("2026-06-08T00:00:00.000Z");
  });

  it("practiceWeekDays — пн–вс с отметками и сегодняшним днём", () => {
    const now = new Date("2026-06-11T15:00:00Z"); // четверг
    const days = practiceWeekDays([new Date("2026-06-08T00:00:00Z"), new Date("2026-06-10T00:00:00Z")], now);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.label)).toEqual(["пн", "вт", "ср", "чт", "пт", "сб", "вс"]);
    expect(days.map((d) => d.done)).toEqual([true, false, true, false, false, false, false]);
    expect(days.findIndex((d) => d.isToday)).toBe(3); // четверг
  });

  it("детерминированный итог недели собирает вопросы недели", () => {
    const text = buildDeterministicWeeklySummary([
      { day: "08.06", question: "Почему я злюсь на работе?", perspective: "..." },
      { day: "09.06", question: null, perspective: null },
    ]);
    expect(text).toContain("Итог недели");
    expect(text).toContain("08.06");
    expect(text).toContain("Почему я злюсь на работе?");
  });
});
