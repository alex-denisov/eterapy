import { describe, expect, it } from "@jest/globals";
import {
  dayNumberFact,
  factFindings,
  needsThreadsFact,
  pickThreadsFact,
  sunGateFact,
} from "@/lib/marketing/threads-facts";

const AT = new Date("2026-10-14T09:00:00.000Z");

describe("B775 общие факты для аудитории: число дня и ворота Солнца", () => {
  it("число дня — сумма цифр даты по Москве, сведённая как в нумерологии платформы", () => {
    const fact = dayNumberFact(AT);
    // 14.10.2026 → 1+4+1+0+2+0+2+6 = 16 → 7
    expect(fact.mechanic).toBe("day_number");
    expect(fact.subject.number).toBe(7);
    expect(fact.statement).toContain("Число дня — 7");
    expect(fact.validUntil).not.toBeNull();
  });

  it("сутки считаются по Москве: 21:30 UTC уже следующая дата", () => {
    expect(dayNumberFact(new Date("2026-10-14T21:30:00.000Z")).subject.number)
      .not.toBe(dayNumberFact(new Date("2026-10-14T09:00:00.000Z")).subject.number);
  });

  it("ворота Солнца: номер 1–64 и срок, пока Солнце в них", () => {
    const fact = sunGateFact(AT);
    expect(fact.mechanic).toBe("hd_sun_gate");
    expect(fact.subject.gate).toBeGreaterThanOrEqual(1);
    expect(fact.subject.gate).toBeLessThanOrEqual(64);
    expect(fact.statement).toMatch(/ворота \d+/i);
    expect(Date.parse(fact.validUntil ?? "")).toBeGreaterThan(AT.getTime());
    expect(Date.parse(fact.validUntil ?? "")).toBeLessThan(AT.getTime() + 8 * 86_400_000);
  });

  it("тема про нумерологию получает число дня, про дизайн человека — ворота", () => {
    expect(needsThreadsFact({ cluster: null, scene: "число судьбы и дата рождения" })).toBe(true);
    expect(pickThreadsFact({ at: AT, cluster: null, scene: "нумерология: число дня", seed: "x" })?.mechanic).toBe("day_number");
    expect(pickThreadsFact({ at: AT, cluster: null, scene: "дизайн человека и ворота", seed: "x" })?.mechanic).toBe("hd_sun_gate");
  });

  it("пост с чужим числом дня ловится, с верным — нет", () => {
    const fact = dayNumberFact(AT);
    expect(factFindings(fact, "Число дня — 7: глубина и смысл")).toEqual([]);
    expect(factFindings(fact, "Число дня — 3, и это про радость").map((f) => f.rule)).toEqual(["fact-day-number"]);
    expect(factFindings(sunGateFact(AT), "Число дня — 5").map((f) => f.rule)).toEqual(["fact-day-number"]);
  });
});
