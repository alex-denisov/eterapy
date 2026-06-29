import {
  TOGETHER_SCENARIOS,
  getTogetherScenario,
  heuristicOutsideViewQuestions,
  questionLeaksPrivateDetail,
  parseQuestionLines,
  sanitizeOutsideViewQuestions,
  toInviteSafeView,
  OUTSIDE_VIEW_FRAMING,
} from "@/lib/together";

describe("B385 «Вместе» scenarios", () => {
  // B463 (M28): the standalone «Совместимость» card was folded into «Сверить взгляды»
  // as the «Ваша связь» relationship mode, so the hub now exposes two scenarios.
  it("exposes exactly two scenarios with distinct keys", () => {
    expect(TOGETHER_SCENARIOS).toHaveLength(2);
    const keys = TOGETHER_SCENARIOS.map((s) => s.key);
    expect(new Set(keys).size).toBe(2);
    expect(keys).toEqual(["outside", "compare"]);
  });

  it("maps each scenario to a valid engine", () => {
    for (const scenario of TOGETHER_SCENARIOS) {
      expect(["outside", "compatibility"]).toContain(scenario.engine);
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.bullets.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("resolves scenarios by key and returns null otherwise", () => {
    expect(getTogetherScenario("outside")?.title).toBe("Свежий взгляд");
    expect(getTogetherScenario("circle")).toBeNull();
    // B463: the compatibility scenario card no longer exists on the hub.
    expect(getTogetherScenario("compatibility")).toBeNull();
  });
});

describe("B385 outside-view question sanitizer (no private leak)", () => {
  const situation =
    "Мой брат Игорь занял у меня крупную сумму в марте и теперь не отвечает на звонки уже три недели подряд.";

  it("flags a question that copies a long verbatim run from the situation", () => {
    expect(
      questionLeaksPrivateDetail("Что думаешь про то, что брат Игорь занял у меня крупную сумму?", situation),
    ).toBe(true);
  });

  it("does not flag neutral questions", () => {
    expect(questionLeaksPrivateDetail("Как тебе видится эта ситуация со стороны?", situation)).toBe(false);
  });

  it("strips numbering and bullets when parsing AI output", () => {
    const parsed = parseQuestionLines("1. Первый вопрос?\n- Второй вопрос?\n• Третий вопрос?\n\n   \n4) Четвёртый?");
    expect(parsed).toEqual(["Первый вопрос?", "Второй вопрос?", "Третий вопрос?", "Четвёртый?"]);
  });

  it("removes leaky/duplicate questions and tops up to at least three", () => {
    const raw = [
      "брат Игорь занял у меня крупную сумму — что скажешь?", // leak
      "Как тебе видится эта ситуация со стороны?",
      "Как тебе видится эта ситуация со стороны?", // dup
    ];
    const safe = sanitizeOutsideViewQuestions(raw, situation);
    expect(safe.length).toBeGreaterThanOrEqual(3);
    expect(safe.length).toBeLessThanOrEqual(5);
    // no leaky question survives
    expect(safe.every((q) => !questionLeaksPrivateDetail(q, situation))).toBe(true);
    // no duplicates
    expect(new Set(safe.map((q) => q.toLowerCase())).size).toBe(safe.length);
  });

  it("never returns more than five questions", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Нейтральный вопрос номер ${i}?`);
    expect(sanitizeOutsideViewQuestions(many, situation).length).toBeLessThanOrEqual(5);
  });

  it("heuristic fallback returns 3–5 neutral questions", () => {
    expect(heuristicOutsideViewQuestions(4)).toHaveLength(4);
    expect(heuristicOutsideViewQuestions(99).length).toBeLessThanOrEqual(5);
    expect(heuristicOutsideViewQuestions(1).length).toBeGreaterThanOrEqual(3);
  });
});

describe("B385 invite-safe projection", () => {
  const baseCircle = {
    id: "c1",
    status: "INVITING",
    topic: "family",
    question: OUTSIDE_VIEW_FRAMING,
    inviteExpiresAt: new Date(Date.now() + 86400000),
    metadata: { mode: "outside", outsideQuestions: ["Вопрос 1?", "Вопрос 2?"] },
    participants: [{ id: "p1" }, { id: "p2" }],
  };

  it("exposes only guest-safe fields and never the creator hashes or answers", () => {
    const view = toInviteSafeView({
      ...baseCircle,
      // simulate the full row carrying private fields
      metadata: { mode: "outside", outsideQuestions: ["Вопрос 1?", "Вопрос 2?"], entry: "circle" },
    });
    expect(view.outsideQuestions).toEqual(["Вопрос 1?", "Вопрос 2?"]);
    expect(view.mode).toBe("outside");
    expect(view.participantCount).toBe(2);
    expect(view.full).toBe(false);
    expect(Object.keys(view)).not.toContain("creatorIpHash");
    expect(Object.keys(view)).not.toContain("participants");
    // answerText must never appear anywhere in the serialized view
    expect(JSON.stringify(view)).not.toContain("answerText");
  });

  it("marks the circle full at five participants", () => {
    const view = toInviteSafeView({
      ...baseCircle,
      participants: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` })),
    });
    expect(view.full).toBe(true);
  });

  it("defaults to circle mode for legacy rows without outside metadata", () => {
    const view = toInviteSafeView({ ...baseCircle, metadata: { entry: "circle" } });
    expect(view.mode).toBe("circle");
    expect(view.outsideQuestions).toEqual([]);
  });
});
