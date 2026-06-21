import {
  DialoguePrimaryAnswerUnavailableError,
  generateDialoguePrimaryAnswer,
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
      provider: "yandex",
      model: "yandexgpt/latest",
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
    expect(result.provider).toBe("yandex");
    expect(result.text).toContain("Короткий ответ");
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "dialogue-primary-answer",
      userId: "user-1",
      requestId: "req-1",
      maxTokens: 900,
    }));
    const request = mockAiComplete.mock.calls[0]?.[0];
    // Task 6: the разбор must NOT recommend paid products inside the prose — a
    // dedicated «можно посмотреть глубже» block does that. So the prompt forbids
    // (not requests) a «Если хочется глубже» section.
    expect(request?.messages[0]?.content).toContain("НЕ рекомендуй платные продукты");
    // Issue #9: the prompt must forbid inline medical/legal/financial caveats —
    // the standard disclaimer is a UI element, not part of the answer prose.
    expect(request?.messages[0]?.content).toContain("НЕ добавляй дисклеймеры");
    expect(result.text).not.toContain("Если хочется глубже");
  });

  // Issue #3: the разбор is ALWAYS LLM-generated. When the single active provider
  // can't answer (after same-provider multi-model retries) we throw so the API
  // can surface an honest retry — we never fall back to a scripted heuristic.
  it("throws when the provider is unavailable", async () => {
    mockAiComplete.mockRejectedValue(new Error("all providers failed"));

    await expect(
      generateDialoguePrimaryAnswer({
        topic: "anxiety",
        difficulty: "high",
        safetyLevel: "sensitive",
        requestId: "req-1",
        messages: [{ role: "USER", content: "Я тревожусь перед разговором" }],
      }),
    ).rejects.toBeInstanceOf(DialoguePrimaryAnswerUnavailableError);
  });

  it("throws when the model returns a too-short answer", async () => {
    mockAiComplete.mockResolvedValue({
      text: "Ок.",
      provider: "yandex",
      model: "yandexgpt/latest",
      tokensIn: 10,
      tokensOut: 2,
      latencyMs: 200,
    });

    await expect(
      generateDialoguePrimaryAnswer({
        topic: "career",
        requestId: "req-2",
        messages: [{ role: "USER", content: "Что делать?" }],
      }),
    ).rejects.toBeInstanceOf(DialoguePrimaryAnswerUnavailableError);
  });
});
