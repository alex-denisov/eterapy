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

  it("never emits a scripted question on the FIRST turn when the LLM is down (resolves to ready)", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider down"));

    const result = await generateDialogueConversationalTurn({
      question: "Стоит ли уходить с работы, если руководитель постоянно обесценивает мои идеи?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [],
      requestId: "req-live-fallback",
    });

    // Issue #3: the clarifying dialogue is ALWAYS LLM-driven — we never fabricate
    // a preset/scripted question to pad the floor. When the gateway is down we
    // resolve to "ready"; the (also LLM-written) разбор then either generates or
    // surfaces an honest retry, but the user never sees a scripted question.
    expect(result).toEqual({ type: "ready", source: "ai" });
  });

  it("resolves to ready (never a scripted question) below MIN turns when the LLM is down", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider down"));

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

    expect(result).toEqual({ type: "ready", source: "ai" });
  });

  it("signals ready on LLM failure once MIN_CLARIFYING_TURNS pairs are reached", async () => {
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

    expect(result).toEqual({ type: "ready", source: "ai" });
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

  it("rejects a premature LLM ready below MIN_CLARIFYING_TURNS (a healthy model keeps asking)", async () => {
    // The LLM tries to wrap up after a single exchange (the prod «один вопрос»
    // bug). Below MIN_CLARIFYING_TURNS the premature ready is rejected on every
    // attempt; with no scripted fallback (issue #3) a model stuck on "ready"
    // resolves to ready, but the rejection is what makes a HEALTHY model ask
    // again on the retry instead of producing a 1-turn разбор.
    mockAiComplete.mockResolvedValue({
      text: '{"q":"","c":[]}',
      provider: "yandex",
      model: "yandexgpt/latest",
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

    expect(result).toEqual({ type: "ready", source: "ai" });
    // Both attempts (initial + retry) were made before giving up — the retry is
    // where a healthy model would have produced a real question.
    expect(mockAiComplete).toHaveBeenCalledTimes(2);
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
    // B554: проверяем КОНТРАКТ промта, а не его формулировки — текст промта
    // правится часто, и тест на дословную фразу ломается при каждой правке,
    // ничего при этом не защищая. Существенно здесь три вещи: отражение и
    // вопрос разведены по разным полям, решение о готовности принимается явным
    // булевым `d`, и роль — практик, а не интервьюер.
    const systemPrompt = request?.messages[0]?.content ?? "";
    expect(systemPrompt).toContain('"m"');
    expect(systemPrompt).toContain('"d"');
    expect(systemPrompt).toContain("практик");
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
