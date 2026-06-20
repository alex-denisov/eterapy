import {
  ZODIAC_SIGNS,
  parseBirthDate,
  zodiacSignForDate,
  buildNatalWheel,
  buildSynastryWheel,
} from "@/lib/esoteric-chart";
import { TAROT_SPREAD_PRESETS, drawTarotSpread, resolveTarotSpread } from "@/lib/symbolic-products";

describe("B388 esoteric chart — deterministic structure", () => {
  it("has 12 zodiac signs with unique keys and glyphs", () => {
    expect(ZODIAC_SIGNS).toHaveLength(12);
    expect(new Set(ZODIAC_SIGNS.map((s) => s.key)).size).toBe(12);
    expect(new Set(ZODIAC_SIGNS.map((s) => s.glyph)).size).toBe(12);
  });

  it("maps known dates to the correct sun sign", () => {
    expect(zodiacSignForDate(15, 4).key).toBe("aries"); // 15 апреля
    expect(zodiacSignForDate(25, 4).key).toBe("taurus"); // 25 апреля
    expect(zodiacSignForDate(1, 1).key).toBe("capricorn"); // 1 января
    expect(zodiacSignForDate(25, 12).key).toBe("capricorn"); // 25 декабря
    expect(zodiacSignForDate(21, 6).key).toBe("cancer"); // солнцестояние
  });

  it("parses multiple birth-date formats", () => {
    expect(parseBirthDate("15.04.1990")).toMatchObject({ day: 15, month: 4, year: 1990, source: "parsed" });
    expect(parseBirthDate("1990-04-15")).toMatchObject({ day: 15, month: 4, year: 1990, source: "parsed" });
    expect(parseBirthDate("5 мая 1988 года, Москва")).toMatchObject({ day: 5, month: 5, year: 1988, source: "parsed" });
  });

  it("derives a stable pseudo-date when no date is present", () => {
    const a = parseBirthDate("просто текст без даты");
    const b = parseBirthDate("просто текст без даты");
    expect(a.source).toBe("derived");
    expect(a).toEqual(b);
  });

  it("clamps impossible day/month values", () => {
    const parsed = parseBirthDate("45.13.1990");
    expect(parsed.month).toBeLessThanOrEqual(12);
    expect(parsed.day).toBeLessThanOrEqual(31);
  });
});

describe("B388 natal wheel", () => {
  it("is deterministic for identical input", () => {
    const a = buildNatalWheel("15.04.1990 14:30 Москва");
    const b = buildNatalWheel("15.04.1990 14:30 Москва");
    expect(a).toEqual(b);
  });

  it("places the Sun in the real solar sign", () => {
    const wheel = buildNatalWheel("15.04.1990");
    expect(wheel.sunSign.key).toBe("aries");
    expect(wheel.placements[0].luminary).toBe("sun");
    expect(wheel.placements[0].signKey).toBe("aries");
    expect(wheel.kind).toBe("natal");
  });

  it("produces 5 luminary placements with angles inside the circle", () => {
    const wheel = buildNatalWheel("01.09.1985");
    expect(wheel.placements).toHaveLength(5);
    for (const p of wheel.placements) {
      expect(p.angle).toBeGreaterThanOrEqual(0);
      expect(p.angle).toBeLessThan(360);
    }
  });
});

describe("B388 synastry wheel", () => {
  it("carries both partners' sun signs and aspect lines", () => {
    const wheel = buildSynastryWheel("15.04.1990", "23.10.1988");
    expect(wheel.kind).toBe("synastry");
    expect(wheel.a.sunSign.key).toBe("aries");
    expect(wheel.b.sunSign.key).toBe("scorpio");
    expect(wheel.aspects.length).toBeGreaterThan(0);
    for (const aspect of wheel.aspects) {
      expect(["flow", "tension"]).toContain(aspect.harmony);
    }
  });
});

describe("B388 tarot spread variety", () => {
  it("draws three distinct cards in a spread", () => {
    const cards = drawTarotSpread("user:вопрос про работу");
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.name)).size).toBe(3);
  });

  it("different questions yield different spreads (not 3 fixed cards)", () => {
    const a = drawTarotSpread("user:что с отношениями");
    const b = drawTarotSpread("user:сменить ли работу");
    const aNames = a.map((c) => c.name).join("|");
    const bNames = b.map((c) => c.name).join("|");
    expect(aNames).not.toBe(bNames);
  });

  it("is stable for the same seed (re-render safe)", () => {
    const a = drawTarotSpread("user:один и тот же вопрос");
    const b = drawTarotSpread("user:один и тот же вопрос");
    expect(a).toEqual(b);
  });

  it("offers the canonical named spreads (depth), with no topic words in the labels", () => {
    const one = drawTarotSpread("user:карта дня", TAROT_SPREAD_PRESETS.one.positions);
    const celtic = drawTarotSpread("user:вопрос", TAROT_SPREAD_PRESETS.celtic.positions);

    // canonical trio: one card / three cards / celtic cross — no arbitrary counts
    expect(Object.keys(TAROT_SPREAD_PRESETS).sort()).toEqual(["celtic", "one", "three"]);
    expect(one).toHaveLength(1);
    expect(one[0].position).toBe("Совет");
    expect(celtic).toHaveLength(10);
    // spread labels are depth/layout, never topic words (those belong to themes)
    const labels = Object.values(TAROT_SPREAD_PRESETS).map((s) => s.label).join(" ");
    expect(labels).not.toMatch(/Отношени|Выбор/);
  });

  it("falls back to the compact three-card spread for unknown choices", () => {
    expect(resolveTarotSpread("unknown").key).toBe("three");
  });
});
