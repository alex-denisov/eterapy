import { aiComplete } from "@/lib/ai";
import { generateSymbolicProductResult } from "@/lib/symbolic-products";

jest.mock("@/lib/ai", () => ({ aiComplete: jest.fn() }));

const mockAiComplete = aiComplete as jest.MockedFunction<typeof aiComplete>;

describe("B502 segmented symbolic generation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAiComplete.mockImplementation(async (request) => {
      const userMessage = request.messages.find((message) => message.role === "user");
      const content = typeof userMessage?.content === "string" ? userMessage.content : "";
      const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
      const factParagraph = "Число пути 5, Число выражения 5 и Число души 4 образуют конкретный портрет. Вы видите, как эти числа проявляются в решениях, работе и внутренней мотивации без подмены расчёта. ".repeat(5);
      return {
        text: headings.map((heading) => `## ${heading}\n\n${factParagraph}\n\n${factParagraph}\n\n${factParagraph}`).join("\n\n"),
        provider: "yandex" as never,
        model: "yandexgpt/latest",
        tokensIn: 500,
        tokensOut: 900,
        latencyMs: 120,
      };
    });
  });

  it("assembles exact calculated numerology sections from independent AI calls", async () => {
    const result = await generateSymbolicProductResult({
      productKey: "numerology",
      userInput: "Имя: Алексей\nДата рождения: 03.03.1988\nСфера: Работа и призвание",
      userId: "user-1",
      requestId: "req-segmented",
    });

    expect(result.metadata).toEqual(expect.objectContaining({
      source: "ai",
      generationParts: 2,
      numerology: expect.objectContaining({ lifePath: 5, expression: 5, soulUrge: 4 }),
    }));
    expect(result.text.length).toBeGreaterThan(5_000);
    expect(result.text).toContain("## Число пути 5 — главный вектор");
    expect(result.text).toContain("## Число выражения 5 — как вы проявляетесь");
    expect(result.text).toContain("## Число души 4 — что вами движет");
    expect(mockAiComplete).toHaveBeenCalledTimes(2);
    expect(mockAiComplete.mock.calls.map(([request]) => request.requestId)).toEqual([
      "req-segmented:part-1",
      "req-segmented:part-2",
    ]);
    for (const [request] of mockAiComplete.mock.calls) {
      const system = request.messages.find((message) => message.role === "system");
      expect(system?.content).toEqual(expect.stringContaining("Число жизненного пути: 5"));
      expect(system?.content).toEqual(expect.stringContaining("Число выражения (по имени): 5"));
      expect(system?.content).toEqual(expect.stringContaining("Число души (по гласным имени): 4"));
    }
  });

  it("generates a three-card Tarot reading in four small reliable parts", async () => {
    const result = await generateSymbolicProductResult({
      productKey: "tarot",
      userInput: "Какая динамика ожидает меня при переходе на новую работу?",
      tarotSpread: "three",
      tarotTheme: "Работа и призвание",
      userId: "user-tarot",
      requestId: "req-tarot",
    });

    expect(result.metadata).toEqual(expect.objectContaining({
      source: "ai",
      generationParts: 4,
      cards: expect.arrayContaining([expect.objectContaining({ name: expect.any(String), position: expect.any(String) })]),
    }));
    expect(result.text).toContain("## Картина расклада");
    expect(result.text).toContain("## Связь карт и скрытая линия");
    expect(result.text).toContain("## Ответ расклада");
    expect(result.text).toContain("## Предупреждение карт");
    expect(mockAiComplete).toHaveBeenCalledTimes(4);
    expect(mockAiComplete.mock.calls.map(([request]) => request.requestId)).toEqual([
      "req-tarot:part-1",
      "req-tarot:part-2",
      "req-tarot:part-3",
      "req-tarot:part-4",
    ]);
  });
});
