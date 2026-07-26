import {
  buildDiaryCard,
  buildHeroAction,
  buildServiceNudge,
  daySeed,
  deepeningForTopic,
  entriesWord,
  pickBy,
  planPractitionerCard,
  type CabinetSignals,
} from "@/lib/cabinet-recommendations";

// B464 round-4 items 2·4·5 — the cabinet recommendation engine. Behaviour
// tests: deterministic within a day, rotates across days, goal-driven states,
// anti-repeat on purchases, booking-aware practitioner plan.

function signals(overrides: Partial<CabinetSignals> = {}): CabinetSignals {
  return {
    topicCounts: {},
    lastDialogue: null,
    activeRoute: null,
    recentProductKeys: [],
    hasUpcomingBooking: false,
    lastPastBooking: null,
    journal: { total: 0, entryToday: false, streak: 0 },
    crisisGuard: false,
    ...overrides,
  };
}

describe("daySeed — deterministic daily rotation", () => {
  it("is stable within a day and changes across days and users", () => {
    const d1 = new Date("2026-07-03T08:00:00Z");
    const d1later = new Date("2026-07-03T21:00:00Z");
    const d2 = new Date("2026-07-04T08:00:00Z");
    expect(daySeed("u1", d1)).toBe(daySeed("u1", d1later));
    expect(daySeed("u1", d1)).not.toBe(daySeed("u1", d2));
    expect(daySeed("u1", d1)).not.toBe(daySeed("u2", d1));
  });

  it("pickBy rotates variants by salt", () => {
    const variants = ["a", "b", "c"] as const;
    expect(pickBy(0, 0, variants)).toBe("a");
    expect(pickBy(0, 1, variants)).toBe("b");
    expect(pickBy(4, 0, variants)).toBe("b");
  });
});

describe("buildHeroAction — item 2 (никогда не «одно и то же»)", () => {
  it("resumes an active route first", () => {
    const hero = buildHeroAction(signals({
      activeRoute: { title: "Маршрут ясности", status: "ACTIVE", currentDay: 3 },
      lastDialogue: { id: "d1", title: "Вопрос", status: "ANSWERED", topic: "self", ageHours: 1 },
    }), 0);
    expect(hero.kind).toBe("resume-route");
    expect(hero.route).toBe("/diary");
  });

  it("resumes a FRESH unfinished разбор, but not a stale one", () => {
    const fresh = buildHeroAction(signals({
      lastDialogue: { id: "d1", title: "Про работу", status: "AWAITING_USER", topic: "career", ageHours: 10 },
    }), 0);
    expect(fresh.kind).toBe("resume-dialogue");
    expect(fresh.route).toBe("/checkin?dialogueId=d1");

    const stale = buildHeroAction(signals({
      lastDialogue: { id: "d1", title: "Про работу", status: "AWAITING_USER", topic: "career", ageHours: 200 },
      topicCounts: { career: 2 },
    }), 0);
    expect(stale.kind).not.toBe("resume-dialogue");
  });

  it("offers a fresh ready answer once, then moves to goal candidates", () => {
    const fresh = buildHeroAction(signals({
      lastDialogue: { id: "d2", title: "Про тревогу", status: "ANSWERED", topic: "anxiety", ageHours: 5 },
    }), 0);
    expect(fresh.kind).toBe("answer-ready");
    expect(fresh.cta).toBe("Посмотреть ответ");

    const stale = buildHeroAction(signals({
      lastDialogue: { id: "d2", title: "Про тревогу", status: "ANSWERED", topic: "anxiety", ageHours: 120 },
      topicCounts: { anxiety: 3 },
    }), 0);
    expect(["deepen", "daily-step", "specialist", "new-question"]).toContain(stale.kind);
  });

  it("anti-repeat: a just-bought deepening is not suggested again", () => {
    const base = signals({
      lastDialogue: { id: "d2", title: "Про тревогу", status: "ANSWERED", topic: "anxiety", ageHours: 120 },
      topicCounts: { anxiety: 3 },
      recentProductKeys: ["deep-report"],
      journal: { total: 2, entryToday: true, streak: 1 },
      hasUpcomingBooking: true,
    });
    // deepen excluded (recent), daily excluded (done today), specialist excluded
    // (booking) → the free new-question fallback remains.
    for (let day = 0; day < 5; day++) {
      expect(buildHeroAction(base, day).kind).toBe("new-question");
    }
  });

  it("rotates goal candidates across days (deterministic per day)", () => {
    const base = signals({
      lastDialogue: { id: "d3", title: "Про деньги", status: "ANSWERED", topic: "money", ageHours: 300 },
      topicCounts: { money: 4 },
    });
    const kinds = new Set<string>();
    for (let seed = 0; seed < 6; seed++) kinds.add(buildHeroAction(base, seed).kind);
    expect(kinds.size).toBeGreaterThan(1); // rotation, not a frozen suggestion
    expect(buildHeroAction(base, 3)).toEqual(buildHeroAction(base, 3)); // stable in-day
  });

  it("invites the very first question when there is no history", () => {
    expect(buildHeroAction(signals(), 0).kind).toBe("first-question");
  });
});

describe("deepeningForTopic — Triage matrix", () => {
  it("maps family(≥3)→сценарии, relationships→pair, self→reframe, else→deep-report", () => {
    expect(deepeningForTopic("family", 3).productKey).toBe("family-scenarios");
    expect(deepeningForTopic("relationships", 0).route).toBe("/products/pair");
    expect(deepeningForTopic("self", 0).productKey).toBe("reframe");
    expect(deepeningForTopic("money", 0).productKey).toBe("deep-report");
  });
});

describe("buildServiceNudge — item 4 (варьируемые тексты, семья ≠ родословная)", () => {
  it("family copy is about отношения с родителями/близкими, not «из поколения в поколение»", () => {
    for (let seed = 0; seed < 4; seed++) {
      const nudge = buildServiceNudge(signals({ topicCounts: { family: 4 } }), seed);
      expect(nudge?.key).toBe("family-scenarios");
      expect(nudge?.body).not.toContain("из поколения в поколение");
      expect(nudge?.body).toMatch(/родител|близки/);
    }
  });

  it("copy varies by day seed", () => {
    const bodies = new Set<string>();
    for (let seed = 0; seed < 4; seed++) {
      bodies.add(buildServiceNudge(signals({ topicCounts: { family: 4 } }), seed)?.body ?? "");
    }
    expect(bodies.size).toBeGreaterThan(1);
  });

  it("anti-repeat falls through to the next candidate after a purchase", () => {
    const nudge = buildServiceNudge(signals({
      topicCounts: { family: 4, anxiety: 2 },
      recentProductKeys: ["family-scenarios"],
    }), 0);
    expect(nudge?.key).not.toBe("family-scenarios");
  });

  it("weak signal → free daily-question, crisis → null", () => {
    expect(buildServiceNudge(signals(), 0)?.key).toBe("daily-question");
    expect(buildServiceNudge(signals({ crisisGuard: true }), 0)).toBeNull();
  });
});

describe("buildDiaryCard — item 5 (динамичный дневник)", () => {
  it("invites the first entry on an empty diary", () => {
    expect(buildDiaryCard(signals(), 0).text).toContain("Дневник пока пуст");
  });

  it("reflects the dominant theme with correct plural (13 записей, not «13 записи»)", () => {
    const card = buildDiaryCard(signals({ topicCounts: { relationships: 13 } }), 0);
    expect(card.text).toMatch(/13 записей|звучит в ваших записях/);
    expect(entriesWord(13)).toBe("записей");
    expect(entriesWord(2)).toBe("записи");
    expect(entriesWord(21)).toBe("запись");
  });

  it("varies across states: streak echo exists too", () => {
    const card = buildDiaryCard(signals({
      topicCounts: { self: 1 },
      journal: { total: 5, entryToday: true, streak: 4 },
    }), 0);
    expect(card.text.length).toBeGreaterThan(10);
  });
});

describe("planPractitionerCard — item 5 (booking-aware)", () => {
  it("yields nothing while an upcoming booking exists", () => {
    expect(planPractitionerCard(signals({ hasUpcomingBooking: true }))).toBeNull();
  });

  it("continues with the same practitioner while the theme still matches", () => {
    const plan = planPractitionerCard(signals({
      topicCounts: { anxiety: 3 },
      lastPastBooking: { practitionerName: "Анна", practitionerSlug: "anna", categories: ["psychology"] },
    }));
    expect(plan?.mode).toBe("continue");
    expect(plan?.continueWith?.slug).toBe("anna");
  });

  it("switches to a theme-matched specialist when the theme moved on", () => {
    const plan = planPractitionerCard(signals({
      topicCounts: { money: 4 },
      lastPastBooking: { practitionerName: "Анна", practitionerSlug: "anna", categories: ["esoteric"] },
    }));
    expect(plan?.mode).toBe("theme-match");
    expect(plan?.categories).toEqual(["finance", "coaching"]);
  });

  it("explores the catalog when the client never booked", () => {
    const plan = planPractitionerCard(signals({ topicCounts: { relationships: 2 } }));
    expect(plan?.mode).toBe("explore");
    expect(plan?.topicLabel).toBe("Отношения");
  });
});
