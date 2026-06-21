import {
  generateDialogueClarifyingQuestions,
  generateDialogueConversationalTurn,
  heuristicClarifyingQuestions,
  parseClarifyingQuestionsResponse,
  parseConversationalTurnResponse,
} from "@/lib/dialogue-clarifier";
import { aiComplete } from "@/lib/ai";

jest.mock("@/lib/ai", () => ({
  __esModule: true,
  aiComplete: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  log: { warn: jest.fn() },
  serializeError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}));

const mockAiComplete = aiComplete as jest.MockedFunction<typeof aiComplete>;

describe("dialogue-clarifier", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses JSON object and keeps 2-5 unique questions", () => {
    const result = parseClarifyingQuestionsResponse(JSON.stringify({
      questions: [
        "Что для вас самое важное?",
        "Что для вас самое важное?",
        "Какой исход будет спокойным?",
        "Что уже пробовали?",
        "Кто влияет на решение?",
        "Что может измениться завтра?",
      ],
    }));
    expect(result?.questions).toEqual([
      "Что для вас самое важное?",
      "Какой исход будет спокойным?",
      "Что уже пробовали?",
      "Кто влияет на решение?",
      "Что может измениться завтра?",
    ]);
    expect(result?.chips).toHaveLength(5);
    result?.chips.forEach((c) => expect(c).toEqual([]));
  });

  it("parses chips alongside questions when provided", () => {
    const result = parseClarifyingQuestionsResponse(JSON.stringify({
      questions: ["Что важнее всего?", "Какой исход спокойный?"],
      chips: [["Острая", "Давняя", "Сложно"], ["Ясность", "Решение", "Не знаю"]],
    }));
    expect(result?.questions).toEqual(["Что важнее всего?", "Какой исход спокойный?"]);
    expect(result?.chips).toEqual([["Острая", "Давняя", "Сложно"], ["Ясность", "Решение", "Не знаю"]]);
  });

  it("rejects responses with fewer than two usable questions", () => {
    expect(parseClarifyingQuestionsResponse('{"questions":["Коротко?"]}')).toBeNull();
  });

  it("generates through AI Gateway with dialogue-clarifier feature", async () => {
    mockAiComplete.mockResolvedValue({
      text: '{"questions":["Что важнее всего прояснить?","Какой исход будет спокойным?"],"chips":[["Острая","Давняя","Сложно"],["Ясность","Решение","Не знаю"]]}',
      provider: "openrouter",
      model: "openrouter/free",
      tokensIn: 12,
      tokensOut: 20,
      latencyMs: 100,
    });

    const result = await generateDialogueClarifyingQuestions({
      question: "Как выбрать работу?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      userId: "user-1",
      requestId: "req-1",
    });

    expect(result).toEqual({
      questions: ["Что важнее всего прояснить?", "Какой исход будет спокойным?"],
      chips: [["Острая", "Давняя", "Сложно"], ["Ясность", "Решение", "Не знаю"]],
      source: "ai",
      provider: "openrouter",
      model: "openrouter/free",
    });
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "dialogue-clarifier",
      userId: "user-1",
      requestId: "req-1",
      maxTokens: 600,
    }));
  });

  it("falls back to heuristic questions when AI is unavailable", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider down"));

    const result = await generateDialogueClarifyingQuestions({
      question: "Тревожусь из-за разговора",
      topic: "anxiety",
      difficulty: "high",
      requestId: "req-1",
    });

    expect(result.source).toBe("heuristic");
    expect(result.questions.length).toBeGreaterThanOrEqual(1);
    expect(result.chips.length).toBe(result.questions.length);
  });

  it("asks a heuristic clarifying question on the FIRST turn when the LLM is down (never silent-skips)", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider down"));

    const result = await generateDialogueConversationalTurn({
      question: "Стоит ли уходить с работы, если руководитель постоянно обесценивает мои идеи?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [],
      requestId: "req-live-fallback",
    });

    // #9: on the FIRST turn we must NEVER silently skip the whole clarifying
    // conversation. If the gateway is down (or the user's AI budget is
    // exhausted), fall back to ONE topic-aware heuristic question so the разбор
    // still opens with a real dialogue. Later turns may still go "ready".
    expect(result.type).toBe("question");
    expect(result.source).toBe("heuristic");
    expect((result.question ?? "").length).toBeGreaterThan(8);
  });

  it("keeps asking a heuristic question below MIN turns when the LLM is down (min 3 questions)", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider down"));

    // Only ONE pair so far → below MIN_CLARIFYING_TURNS. The разбор must NOT be
    // produced after a single question (the «выдал только один вопрос» bug):
    // when the LLM is unavailable we fall back to the NEXT heuristic question so
    // the conversation reaches at least 3 meaningful exchanges.
    const result = await generateDialogueConversationalTurn({
      question: "Стоит ли уходить с работы, если руководитель обесценивает мои идеи?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [
        {
          assistant: "Слышу, что вопрос не только про смену работы…",
          user: "Страх оценки и ощущение, что меня всё равно не услышат.",
        },
      ],
      requestId: "req-min-turns-fallback",
    });

    expect(result.type).toBe("question");
    expect(result.source).toBe("heuristic");
    expect((result.question ?? "").length).toBeGreaterThan(8);
  });

  it("only signals ready on LLM failure once MIN_CLARIFYING_TURNS pairs are reached", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider down"));

    const result = await generateDialogueConversationalTurn({
      question: "Стоит ли уходить с работы?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [
        { assistant: "Q1", user: "A1" },
        { assistant: "Q2", user: "A2" },
        { assistant: "Q3", user: "A3" },
      ],
      requestId: "req-ready-after-min",
    });

    expect(result).toEqual({ type: "ready", source: "heuristic" });
  });

  it("signals ready after MAX_CLARIFYING_TURNS pairs without calling the LLM", async () => {
    mockAiComplete.mockResolvedValue({
      text: '{"q":"never used","c":[]}',
      provider: "openai",
      model: "gpt-test",
      tokensIn: 1,
      tokensOut: 1,
      latencyMs: 10,
    });

    const result = await generateDialogueConversationalTurn({
      question: "Большой вопрос",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [
        { assistant: "Q1", user: "A1" },
        { assistant: "Q2", user: "A2" },
        { assistant: "Q3", user: "A3" },
        { assistant: "Q4", user: "A4" },
        { assistant: "Q5", user: "A5" },
      ],
      requestId: "req-max-pairs",
    });

    expect(result).toEqual({ type: "ready", source: "heuristic" });
    expect(mockAiComplete).not.toHaveBeenCalled();
  });

  it("turns a premature LLM ready before MIN_CLARIFYING_TURNS into another question", async () => {
    // The LLM tries to wrap up after a single exchange (the prod «один вопрос»
    // bug). Below MIN_CLARIFYING_TURNS the premature ready must be converted into
    // the next heuristic clarifying question instead of jumping to the разбор.
    mockAiComplete.mockResolvedValue({
      text: '{"q":"","c":[]}',
      provider: "openai",
      model: "gpt-test",
      tokensIn: 1,
      tokensOut: 1,
      latencyMs: 10,
    });

    const result = await generateDialogueConversationalTurn({
      question: "Стоит ли менять работу?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [
        { assistant: "Q1", user: "A1" },
      ],
      requestId: "req-premature-ready",
    });

    expect(result.type).toBe("question");
    expect(result.source).toBe("heuristic");
    expect((result.question ?? "").length).toBeGreaterThan(8);
  });

  it("returns an AI conversational turn with provider metadata when the gateway answers", async () => {
    mockAiComplete.mockResolvedValue({
      text: '{"q":"Слышу, что вам важно вернуть опору, а не просто доказать ценность руководителю.\\n\\nЧто изменится для вас, если сегодня не доказывать свою ценность?","c":["Станет легче","Появится страх","Не знаю"]}',
      provider: "openai",
      model: "gpt-test",
      tokensIn: 120,
      tokensOut: 40,
      latencyMs: 300,
    });

    const result = await generateDialogueConversationalTurn({
      question: "Руководитель обесценивает мои идеи",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [],
      userId: "user-1",
      requestId: "req-live-ai",
    });

    expect(result).toEqual(expect.objectContaining({
      type: "question",
      source: "ai",
      provider: "openai",
      model: "gpt-test",
      question: expect.stringContaining("Слышу"),
    }));
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "dialogue-clarifier",
      userId: "user-1",
      requestId: "req-live-ai",
    }));
    const request = mockAiComplete.mock.calls[0]?.[0];
    expect(request?.messages[0]?.content).toContain("короткая живая реплика");
  });

  it("heuristic returns fallback questions for any topic", () => {
    const result = heuristicClarifyingQuestions({
      question: "Что делать с отношениями?",
      topic: "relationships",
      difficulty: "medium",
    });
    expect(result.questions.length).toBeGreaterThanOrEqual(1);
    expect(result.chips.length).toBe(result.questions.length);
  });

  it("heuristic returns chips aligned to questions", () => {
    const result = heuristicClarifyingQuestions({
      question: "Тревога не отпускает",
      topic: "anxiety",
      difficulty: "low",
    });
    expect(result.chips.length).toBe(result.questions.length);
    result.chips.forEach((c) => expect(c.length).toBeGreaterThan(0));
  });
});

describe("parseConversationalTurnResponse — never leak raw JSON to the user", () => {
  it("salvages q/c from MALFORMED json (missing closing bracket — the prod bug)", () => {
    const malformed = '{"q":"Молчание перед уходом — это про то, что он не хочет тебя расстраивать, или про то, что ему самому слишком тяжело?","c":["Не хочет расстраивать","Слишком тяжело","Нужно время"}';
    const result = parseConversationalTurnResponse(malformed);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("question");
    expect(result!.question).toContain("Молчание перед уходом");
    // the raw JSON envelope must never appear in the rendered question
    expect(result!.question).not.toContain('"q"');
    expect(result!.question).not.toContain('"c"');
    expect(result!.question).not.toMatch(/^\s*\{/);
    expect(result!.chips).toEqual(["Не хочет расстраивать", "Слишком тяжело", "Нужно время"]);
  });

  it("parses well-formed short json", () => {
    const result = parseConversationalTurnResponse('{"q":"Что сейчас острее всего просит ясности в этой ситуации с работой?","c":["Решение","Спокойствие"]}');
    expect(result!.type).toBe("question");
    expect(result!.question).toContain("ясности");
    expect(result!.chips).toEqual(["Решение", "Спокойствие"]);
  });

  it("treats empty q (well-formed or malformed) as ready, not a leaked envelope", () => {
    expect(parseConversationalTurnResponse('{"q":"","c":[]}')!.type).toBe("ready");
    expect(parseConversationalTurnResponse('{"q":"","c":[}')!.type).toBe("ready");
  });

  it("returns null for unsalvageable json instead of leaking it", () => {
    expect(parseConversationalTurnResponse('{"foo":"bar","baz":[}')).toBeNull();
  });

  it("still accepts a plain natural-language question (no JSON envelope)", () => {
    const result = parseConversationalTurnResponse("Что в этой ситуации сейчас сильнее всего требует ясности?");
    expect(result!.type).toBe("question");
    expect(result!.question).toContain("ясности");
  });
});
