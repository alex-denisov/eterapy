import { ZODIAC_FAMILY_CLUSTERS, threadsCountForDay, threadsDayLineup } from "@/lib/marketing/threads-lineup";
import { threadsSlotRoles, type ThreadsRole } from "@/lib/marketing/threads-ladder";
import { SERIES_FORMAT } from "@/lib/marketing/threads-series";
import { isCtaEligibleLabel } from "@/lib/marketing/threads-cta";

const DAYS = Array.from({ length: 120 }, (_, index) => 20_800 + index);
const lineups = DAYS.map((day) => threadsDayLineup(day));
const zodiac = (entry?: { format: { cluster?: string } }) => ZODIAC_FAMILY_CLUSTERS.has(entry?.format.cluster ?? "");
const WISH = new Set(["K1", "K26", "K27"]);
const DISCUSSION = new Set(["K14", "K15", "K18"]);

describe("B776 F6: приближение форматов к времени суток", () => {
  it("инварианты сохранены: уникальность, знаки не подряд (и через полночь) и не больше двух, ядро", () => {
    for (const lineup of lineups) {
      expect(lineup).toHaveLength(8);
      expect(new Set(lineup.map((entry) => entry.format.label)).size).toBe(lineup.length);
      expect(lineup.filter(zodiac).length).toBeLessThanOrEqual(2);
      const core = lineup.filter((entry) => entry.format.heroes === "core").map((entry) => entry.heroIndex);
      expect(new Set(core).size).toBe(core.length);
    }
    const flat = lineups.flat();
    for (let i = 1; i < flat.length; i += 1) expect(zodiac(flat[i - 1]) && zodiac(flat[i])).toBe(false);
  });

  // Доля слотов роли `roles`, где стоит формат из `set`: считается по ролям времени суток (B777), а не по номерам.
  const share = (roles: ThreadsRole[], set: ReadonlySet<string>) => {
    let hits = 0;
    let total = 0;
    for (const lineup of lineups) {
      const slotRoles = threadsSlotRoles(lineup.length);
      lineup.forEach((entry, index) => {
        if (!roles.includes(slotRoles[index].role)) return;
        total += 1;
        if (set.has(entry.format.cluster ?? "")) hits += 1;
      });
    }
    return hits / total;
  };

  it("пожелания — чаще утром и ночью, чем днём", () => {
    expect(share(["morning", "night"], WISH)).toBeGreaterThan(share(["midday"], WISH));
  });

  it("вечер чаще несёт обсуждение, чем утро", () => {
    expect(share(["evening"], DISCUSSION)).toBeGreaterThan(share(["morning"], DISCUSSION));
  });

  it("экспертный формат K28 по возможности стоит утром", () => {
    const withK28 = lineups.filter((l) => l.some((e) => e.format.cluster === "K28"));
    expect(withK28.length).toBeGreaterThan(10);
    const morning = withK28.filter((l) => threadsSlotRoles(l.length)[l.findIndex((e) => e.format.cluster === "K28")].role === "morning").length;
    expect(morning / withK28.length).toBeGreaterThan(0.6);
  });

  it("расклад детерминирован", () => {
    expect(threadsDayLineup(20_900).map((e) => e.format.label)).toEqual(threadsDayLineup(20_900).map((e) => e.format.label));
  });
});

describe("B776 F3/F4: серия в вечернем слоте и один CTA в сутки", () => {
  it("с серией последний слот (поздний вечер) — формат серии; без неё — нет", () => {
    const info = { day: 3, total: 30, isAnnouncement: false };
    for (const day of DAYS.slice(0, 40)) {
      const lineup = threadsDayLineup(day, { series: info });
      expect(lineup[lineup.length - 1].format).toBe(SERIES_FORMAT);
      expect(lineup[lineup.length - 1].series).toEqual(info);
      expect(lineup.filter((e) => e.format === SERIES_FORMAT)).toHaveLength(1);
      expect(new Set(lineup.map((e) => e.format.label)).size).toBe(lineup.length);
      expect(lineup.filter(zodiac).length).toBeLessThanOrEqual(2);
      expect(threadsDayLineup(day).some((e) => e.format === SERIES_FORMAT)).toBe(false);
    }
  });
  it("знаки не подряд и через полночь при серии", () => {
    const flat = DAYS.slice(0, 40).flatMap((day) => threadsDayLineup(day, { series: { day: 2, total: 30, isAnnouncement: false } }));
    for (let i = 1; i < flat.length; i += 1) expect(zodiac(flat[i - 1]) && zodiac(flat[i])).toBe(false);
  });
  it("призыв не чаще одного в сутки (при восьми постах — двух): первый подходящий слот", () => {
    for (const lineup of lineups.concat(DAYS.slice(0, 30).map((d) => threadsDayLineup(d, { series: { day: 5, total: 30, isAnnouncement: false } })))) {
      const marked = lineup.filter((e) => e.cta);
      expect(marked.length).toBeLessThanOrEqual(lineup.length >= 8 ? 2 : 1);
      const firstEligible = lineup.find((e) => isCtaEligibleLabel(e.format.label));
      if (firstEligible) expect(marked[0]).toBe(firstEligible);
      else expect(marked).toHaveLength(0);
      for (const e of marked) expect(isCtaEligibleLabel(e.format.label)).toBe(true);
    }
  });
});

describe("B776 MEDIUM-1: стык суток на 3000 суток подряд", () => {
  it("два оклика знака не стоят рядом ни внутри суток, ни через полночь; не больше двух в сутки", () => {
    const flat: ReturnType<typeof threadsDayLineup> = [];
    for (let day = 20_500; day < 23_500; day += 1) {
      const lineup = threadsDayLineup(day);
      expect(lineup.filter(zodiac).length).toBeLessThanOrEqual(2);
      expect(new Set(lineup.map((entry) => entry.format.label)).size).toBe(threadsCountForDay(day));
      flat.push(...lineup);
    }
    const bad = flat.findIndex((entry, i) => i > 0 && zodiac(flat[i - 1]) && zodiac(entry));
    expect(bad).toBe(-1);
  });
  it("результат не зависит от порядка вызовов", () => {
    const forward = threadsDayLineup(21_127).map((e) => e.format.label);
    threadsDayLineup(21_500);
    threadsDayLineup(21_100);
    expect(threadsDayLineup(21_127).map((e) => e.format.label)).toEqual(forward);
  });
});
