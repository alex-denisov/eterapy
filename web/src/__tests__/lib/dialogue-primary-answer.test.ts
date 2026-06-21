import {
  generateDialoguePrimaryAnswer,
  heuristicPrimaryAnswer,
} from "@/lib/dialogue-primary-answer";
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

describe("dialogue-primary-answer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generates the primary answer through the AI Gateway policy", async () => {
    mockAiComplete.mockResolvedValue({
      text: [
        "Короткий ответ",
        "Вам стоит выбрать вариант, где больше устойчивости и меньше внутреннего напряжения.",
        "",
        "Что кажется важным",
        "Сравните не только выгоду, но и то, как каждый путь влияет на ваш ритм.",
        "",
        "Мягкий следующий шаг",
        "Запишите по одному маленькому действию для каждого варианта и выберите самое спокойное.",
      ].join("\n"),
      provider: "openrouter",
      model: "openrouter/free",
      tokensIn: 100,
      tokensOut: 160,
      latencyMs: 1200,
    });

    const result = await generateDialoguePrimaryAnswer({
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      userId: "user-1",
      requestId: "req-1",
      messages: [
        { role: "USER", content: "Как выбрать работу?" },
        { role: "ASSISTANT", content: "1. Что важно?" },
        { role: "USER", content: "Хочу устойчивости" },
      ],
    });

    expect(result.source).toBe("ai");
    expect(result.provider).toBe("openrouter");
    expect(result.text).toContain("Короткий ответ");
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "dialogue-primary-answer",
      userId: "user-1",
      requestId: "req-1",
      maxTokens: 900,
    }));
    const request = mockAiComplete.mock.calls[0]?.[0];
    // Task 6: the разбор must NOT recommend paid products inside the prose — a
    // dedicated «можно посмотреть глубже» block does that. So the prompt must
    // forbid (not request) a «Если хочется глубже» section.
    expect(request?.messages[0]?.content).toContain("Do NOT recommend any paid product");
    expect(result.text).not.toContain("Если хочется глубже");
  });

  it("falls back to a safe heuristic answer if all providers fail", async () => {
    mockAiComplete.mockRejectedValue(new Error("all providers failed"));

    const result = await generateDialoguePrimaryAnswer({
      topic: "anxiety",
      difficulty: "high",
      safetyLevel: "sensitive",
      requestId: "req-1",
      messages: [{ role: "USER", content: "Я тревожусь перед разговором" }],
    });

    expect(result.source).toBe("heuristic");
    expect(result.text).toContain("Короткий ответ");
    // Task 6: no in-prose product recommendation section anymore.
    expect(result.text).not.toContain("Если хочется глубже");
    expect(result.text).toContain("Важно: это не медицинская");
  });

  it("creates topic-aware heuristic answers", () => {
    const result = heuristicPrimaryAnswer({
      topic: "relationships",
      difficulty: "medium",
      messages: [{ role: "USER", content: "Что делать в отношениях?" }],
    });

    expect(result.text).toContain("повторяющийся сценарий");
  });
});
