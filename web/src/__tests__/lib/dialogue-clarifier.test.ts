import {
  generateDialogueClarifyingQuestions,
  generateDialogueConversationalTurn,
  heuristicClarifyingQuestions,
  parseClarifyingQuestionsResponse,
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

  it("keeps the live conversational fallback contextual instead of repeating a generic script", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider down"));

    const result = await generateDialogueConversationalTurn({
      question: "Стоит ли уходить с работы, если руководитель постоянно обесценивает мои идеи?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [],
      requestId: "req-live-fallback",
    });

    expect(result.type).toBe("question");
    if (result.type === "question") {
      expect(result.source).toBe("heuristic");
      expect(result.question).toMatch(/работ|руководител|иде/i);
      expect([
        "Что сейчас самое важное для вас в этом вопросе?",
        "Что вы уже пробовали или рассматривали?",
      ]).not.toContain(result.question);
    }
  });

  it("does not repeat a contextual fallback turn after the user has already answered it", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider down"));

    const result = await generateDialogueConversationalTurn({
      question: "Стоит ли уходить с работы, если руководитель обесценивает мои идеи?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      previousPairs: [
        {
          assistant: "Слышу, что вопрос не только про смену работы, а про то, как вернуть себе голос там, где ваши идеи обесценивают. Что в ситуации с работой и руководителем сильнее всего заставляет вас уменьшать свои идеи или голос?",
          user: "Страх оценки и ощущение, что меня всё равно не услышат.",
        },
      ],
      requestId: "req-no-repeat-fallback",
    });

    expect(result.type).toBe("question");
    if (result.type === "question") {
      expect(result.source).toBe("heuristic");
      expect(result.question).not.toMatch(/уменьшать свои идеи или голос/);
      expect(result.chips?.length).toBeGreaterThan(0);
    }
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

  it("guards against premature LLM ready before MIN_CLARIFYING_TURNS", async () => {
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
