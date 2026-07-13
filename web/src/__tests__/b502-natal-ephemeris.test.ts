import { buildNatalEphemerisWheel, buildSynastryEphemerisWheel, textMentionsZodiacSign } from "@/lib/natal-ephemeris";

describe("B502 real natal and synastry ephemerides", () => {
  it("calculates ten real tropical placements, ASC and equal houses for Chisinau", () => {
    const wheel = buildNatalEphemerisWheel("03.03.1988, 21:00, Кишинёв");

    expect(wheel.calculation).toBe("ephemeris");
    expect(wheel.sunSign.name).toBe("Рыбы");
    expect(wheel.placements).toHaveLength(10);
    expect(wheel.placements.map((placement) => placement.luminary)).toEqual([
      "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
    ]);
    expect(wheel.ascendant).not.toBeNull();
    expect(wheel.houses).toHaveLength(12);
  });

  it("builds synastry from two ephemeris charts and real cross-chart aspects", () => {
    const wheel = buildSynastryEphemerisWheel(
      "12.04.1992, 14:35, Москва",
      "09.11.1990, 08:10, Санкт-Петербург",
    );

    expect(wheel.a.placements).toHaveLength(10);
    expect(wheel.b.placements).toHaveLength(10);
    expect(wheel.aspects.length).toBeGreaterThan(3);
    expect(wheel.aspects[0]).toEqual(expect.objectContaining({ kind: expect.any(String), orb: expect.any(Number) }));
  });

  it("recognizes Russian zodiac names in natural grammatical cases", () => {
    expect(textMentionsZodiacSign("Солнце находится в Рыбах, а Луна — во Льве.", "Рыбы")).toBe(true);
    expect(textMentionsZodiacSign("Солнце находится в Рыбах, а Луна — во Льве.", "Лев")).toBe(true);
    expect(textMentionsZodiacSign("Влияние Тельца сочетается со Скорпионом.", "Телец")).toBe(true);
    expect(textMentionsZodiacSign("Влияние Тельца сочетается со Скорпионом.", "Скорпион")).toBe(true);
  });
});
