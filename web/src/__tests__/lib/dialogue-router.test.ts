import { aiComplete } from "@/lib/ai";
import {
  classifyDialogueQuestion,
  heuristicDialogueRoute,
  parseDialogueRoutingResponse,
} from "@/lib/dialogue-router";

jest.mock("@/lib/ai", () => ({
  __esModule: true,
  aiComplete: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { warn: jest.fn() },
  serializeError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}));

const mockAiComplete = aiComplete as jest.MockedFunction<typeof aiComplete>;

describe("dialogue-router", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses strict JSON routing output", () => {
    expect(parseDialogueRoutingResponse('{"topic":"relationships","difficulty":"high","confidence":0.91}')).toEqual({
      topic: "relationships",
      difficulty: "high",
      confidence: 0.91,
    });
  });

  it("normalizes unsupported model values to safe defaults", () => {
    expect(parseDialogueRoutingResponse('prefix {"topic":"unknown","difficulty":"extreme","confidence":4} suffix')).toEqual({
      topic: "other",
      difficulty: "medium",
      confidence: 1,
    });
  });

  it("has deterministic heuristic fallback for topic and difficulty", () => {
    expect(heuristicDialogueRoute("Я снова тревожусь из-за работы уже несколько лет")).toEqual(expect.objectContaining({
      topic: "career",
      difficulty: "medium",
      source: "heuristic",
    }));
  });

  it("classifies through AI Gateway with the dialogue-router feature", async () => {
    mockAiComplete.mockResolvedValue({
      text: '{"topic":"money","difficulty":"low","confidence":0.75}',
      provider: "openrouter",
      model: "openrouter/free",
      tokensIn: 20,
      tokensOut: 10,
      latencyMs: 50,
    });

    await expect(classifyDialogueQuestion({
      question: "Что делать с деньгами?",
      userId: "user-1",
      requestId: "req-1",
    })).resolves.toEqual({
      topic: "money",
      difficulty: "low",
      confidence: 0.75,
      source: "ai",
      provider: "openrouter",
      model: "openrouter/free",
    });
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "dialogue-router",
      userId: "user-1",
      requestId: "req-1",
      maxTokens: 140,
      temperature: 0,
    }));
  });

  it("falls back to heuristic routing if AI Gateway is unavailable", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider unavailable"));

    await expect(classifyDialogueQuestion({
      question: "Мне тревожно",
      requestId: "req-1",
    })).resolves.toEqual(expect.objectContaining({
      topic: "anxiety",
      source: "heuristic",
    }));
  });
});
