jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import { contentPlanFor } from "@/lib/marketing/content-plan";
import { chainWithCta, ctaPartFor, buildCtaLine, CTA_TARGETS } from "@/lib/marketing/threads-cta";
import {
  activeGridIndexes, dateOfDayNumber, THREADS_GRID_TIMES, threadsPostsPerDay, threadsSlotRoles,
} from "@/lib/marketing/threads-ladder";
import { threadsDayLineup } from "@/lib/marketing/threads-lineup";
import { SERIES_FORMAT } from "@/lib/marketing/threads-series";
import {
  CHECKLIST_CHAIN_FORMAT, MINI_PRACTICE_FORMAT, MYTH_TRUTH_FORMAT, usefulFormatForWeekday, weekdayOfDayNumber,
} from "@/lib/marketing/threads-useful-formats";

const dayOf = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const mskMinutes = (iso: string) => {
  const msk = new Date(new Date(iso).getTime() + 3 * 3_600_000);
  return msk.getUTCHours() * 60 + msk.getUTCMinutes();
};
const threadsByDay = (now: Date) => {
  const byDay = new Map<string, ReturnType<typeof contentPlanFor>[number][]>();
  for (const slot of contentPlanFor(now).filter((item) => item.channel === "threads")) {
    const date = new Date(new Date(slot.scheduledAt).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
    byDay.set(date, [...(byDay.get(date) ?? []), slot]);
  }
  return byDay;
};

describe("B777: лесенка постов в сутки", () => {
  it.each([
    ["2026-10-14", 4], ["2026-10-31", 4], ["2026-11-01", 5], ["2026-11-07", 5],
    ["2026-11-08", 6], ["2026-11-14", 6], ["2026-11-15", 7], ["2026-11-21", 7],
    ["2026-11-22", 8], ["2027-03-01", 8],
  ])("%s → %i постов", (date, count) => {
    expect(threadsPostsPerDay(date)).toBe(count);
  });

  it("слоты вкладываются: следующая ступень только добавляет время", () => {
    for (let count = 4; count < 8; count += 1) {
      const smaller = activeGridIndexes(count);
      const bigger = activeGridIndexes(count + 1);
      expect(bigger).toHaveLength(count + 1);
      expect(smaller.every((index) => bigger.includes(index))).toBe(true);
    }
    expect(activeGridIndexes(4).map((index) => THREADS_GRID_TIMES[index].weekday)).toEqual(["08:00", "12:30", "19:30", "22:45"]);
  });

  it("роли слотов — по времени суток, главный вечерний слот один и всегда 19:30", () => {
    for (let count = 4; count <= 8; count += 1) {
      const roles = threadsSlotRoles(count);
      expect(roles.filter((slot) => slot.main)).toHaveLength(1);
      expect(roles[0].role).toBe("morning");
      expect(roles[roles.length - 1].role).toBe("night");
    }
    expect(threadsSlotRoles(4).map((slot) => slot.role)).toEqual(["morning", "midday", "evening", "night"]);
  });

  it("план до 31.10 — ровно 4 слота в сутки, на 01.11 — 5, далее по таблице; ни один слот не теряется", () => {
    const expectCounts = (now: Date) => {
      for (const [date, slots] of threadsByDay(now)) {
        expect(slots).toHaveLength(threadsPostsPerDay(date));
        expect(new Set(slots.map((slot) => slot.key)).size).toBe(slots.length);
        const minutes = slots.map((slot) => mskMinutes(slot.scheduledAt)).sort((a, b) => a - b);
        expect(minutes[0]).toBeGreaterThanOrEqual(7 * 60 + 30);
        expect(minutes[minutes.length - 1]).toBeLessThanOrEqual(23 * 60 + 30);
        for (let i = 1; i < minutes.length; i += 1) expect(minutes[i] - minutes[i - 1]).toBeGreaterThanOrEqual(60);
      }
    };
    for (const now of ["2026-10-14T03:00:00Z", "2026-10-29T03:00:00Z", "2026-11-05T03:00:00Z", "2026-11-12T03:00:00Z", "2026-11-19T03:00:00Z"]) {
      expectCounts(new Date(now));
    }
    const edge = threadsByDay(new Date("2026-10-29T03:00:00Z"));
    expect(edge.get("2026-10-31")).toHaveLength(4);
    expect(edge.get("2026-11-01")).toHaveLength(5);
  });

  it("слот-идентификаторы не едут при шаге лесенки: 08:00 — slot-1, 19:30 — slot-6, 22:45 — slot-8", () => {
    const edge = threadsByDay(new Date("2026-10-29T03:00:00Z"));
    const dayparts = (date: string) => edge.get(date)!.map((slot) => slot.daypart);
    expect(dayparts("2026-10-31")).toEqual(["slot-1", "slot-3", "slot-6", "slot-8"]);
    expect(dayparts("2026-11-01")).toEqual(["slot-1", "slot-3", "slot-5", "slot-6", "slot-8"]);
  });

  it("вечерний слот (19:30 в будни) в плане несёт формат дня недели", () => {
    const plan = contentPlanFor(new Date("2026-10-14T03:00:00Z")).filter((slot) => slot.channel === "threads");
    const labels = new Map<number, string>();
    for (const slot of plan.filter((item) => item.daypart === "slot-6")) {
      const weekday = new Date(slot.scheduledAt).getUTCDay();
      const useful = usefulFormatForWeekday(weekday);
      if (useful) expect(slot.format).toBe(useful.label);
      labels.set(weekday, slot.format);
    }
    expect([...labels.keys()].length).toBeGreaterThanOrEqual(5);
  });
});

describe("B777: полезные форматы по дням недели и серия", () => {
  it("пн — миф/правда, ср — мини-практика, пт — чек-лист; остальные дни без полезного формата", () => {
    expect(usefulFormatForWeekday(1)).toBe(MYTH_TRUTH_FORMAT);
    expect(usefulFormatForWeekday(3)).toBe(MINI_PRACTICE_FORMAT);
    expect(usefulFormatForWeekday(5)).toBe(CHECKLIST_CHAIN_FORMAT);
    for (const weekday of [0, 2, 4, 6]) expect(usefulFormatForWeekday(weekday)).toBeNull();
    expect(weekdayOfDayNumber(dayOf("2026-10-14"))).toBe(3); // среда
    expect(weekdayOfDayNumber(dayOf("2026-10-19"))).toBe(1); // понедельник
    expect(dateOfDayNumber(dayOf("2026-10-19"))).toBe("2026-10-19");
  });

  it("главный вечерний слот в пн/ср/пт — полезный формат цепочкой, ссылки в формате нет", () => {
    for (const [date, expected] of [["2026-10-19", MYTH_TRUTH_FORMAT], ["2026-10-21", MINI_PRACTICE_FORMAT], ["2026-10-23", CHECKLIST_CHAIN_FORMAT]] as const) {
      const lineup = threadsDayLineup(dayOf(date));
      expect(lineup).toHaveLength(4);
      expect(lineup[2].format).toBe(expected);
      expect(expected.reply).toBe("continuation");
      expect(expected.link).toBe(false);
    }
    expect(threadsDayLineup(dayOf("2026-10-20"))[2].format.cluster).not.toMatch(/^K3[0-2]$/);
  });

  it("серия «Паттерн дня» — в последнем слоте суток; полезный формат вечера остаётся", () => {
    const lineup = threadsDayLineup(dayOf("2026-10-21"), { series: { day: 3, total: 30, isAnnouncement: false } });
    expect(lineup[lineup.length - 1].format).toBe(SERIES_FORMAT);
    expect(lineup[2].format).toBe(MINI_PRACTICE_FORMAT);
    expect(SERIES_FORMAT.label).toContain("Паттерн дня");
  });

  it("форматы не говорят про работу с клиентами", () => {
    for (const format of [MYTH_TRUTH_FORMAT, MINI_PRACTICE_FORMAT, CHECKLIST_CHAIN_FORMAT, SERIES_FORMAT]) {
      const text = [format.construction, format.example].join(" ");
      expect(text).not.toMatch(/из работы с людьми|из практики|невыдуман|основательниц/i);
      expect(format.rules.join(" ")).toMatch(/сооснователь/);
    }
  });
});

describe("B777: призыв отдельной частью и замер A/B", () => {
  it("не больше одного призыва в сутки при 4 постах, не больше двух при 8", () => {
    for (let day = dayOf("2026-10-14"); day < dayOf("2026-12-31"); day += 1) {
      const lineup = threadsDayLineup(day, { series: { day: 5, total: 30, isAnnouncement: false } });
      const marked = lineup.filter((entry) => entry.cta);
      expect(marked.length).toBeLessThanOrEqual(lineup.length >= 8 ? 2 : 1);
      expect(marked.length).toBeGreaterThanOrEqual(1);
      for (const entry of marked) expect(entry.ctaPlace).toBe(day % 2 === 0 ? "mid" : "end");
    }
  });

  it("метка в ссылке: услуга-mid / услуга-end; основной пост без ссылки", () => {
    const target = CTA_TARGETS.find((item) => item.slug === "tarot")!;
    expect(buildCtaLine(target, "mid")).toContain("utm_content=tarot-mid");
    expect(buildCtaLine(target, "end")).toContain("utm_content=tarot-end");
    const { replyText, ctaLine } = ctaPartFor("Шаг один: «стоп». Ссылка https://fake.example/x.", { postText: "расклад", place: "mid" });
    expect(replyText).not.toMatch(/https?:/);
    expect(ctaLine).toContain("utm_content=tarot-mid");
  });

  it("части цепочки: end — призыв последним; mid — перед закрывающей строкой; одна часть — призыв после неё", () => {
    const body = ["Первая часть пользы.", "Вторая часть пользы.", "Закрывающая строка."].join("\n\n");
    // splitThreadsChain склеивает короткие абзацы в одну часть, поэтому берём длинные части
    const long = ["а".repeat(300) + ".", "б".repeat(300) + ".", "в".repeat(60) + "."].join("\n\n");
    expect(chainWithCta(body, null)).toHaveLength(1);
    const end = chainWithCta(long, "ССЫЛКА", "end");
    expect(end[end.length - 1]).toBe("ССЫЛКА");
    const mid = chainWithCta(long, "ССЫЛКА", "mid");
    expect(mid[mid.length - 1]).not.toBe("ССЫЛКА");
    expect(mid[mid.length - 2]).toBe("ССЫЛКА");
    expect(chainWithCta("Одна короткая часть.", "ССЫЛКА", "mid")).toEqual(["Одна короткая часть.", "ССЫЛКА"]);
  });
});
