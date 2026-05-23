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
      previousPairs: [
        {
          assistant: "Что в этой ситуации стало для вас самым болезненным?",
          user: "Я перестала предлагать идеи, потому что руководитель сразу говорит, что это ерунда.",
        },
      ],
      requestId: "req-live-fallback",
    });

    expect(result.type).toBe("question");
    if (result.type === "question") {
      expect(result.source).toBe("heuristic");
      expect(result.question).toMatch(/работ|руководител|иде/i);
      expect([
        "Что сейчас самое важное в этой ситуации — понять, решить, отпустить или подготовиться?",
        "Что вы уже пробовали, и что из этого хоть немного помогло?",
      ]).not.toContain(result.question);
    }
  });

  it("returns an AI conversational turn with provider metadata when the gateway answers", async () => {
    mockAiComplete.mockResolvedValue({
      text: '{"q":"Что изменится для вас, если вы сегодня не будете доказывать ценность руководителю?","c":["Станет легче","Появится страх","Не знаю"]}',
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
    }));
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "dialogue-clarifier",
      userId: "user-1",
      requestId: "req-live-ai",
    }));
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
