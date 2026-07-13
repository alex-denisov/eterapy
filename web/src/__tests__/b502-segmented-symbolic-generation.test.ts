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
      const factParagraph = "Центр матрицы 10, личное предназначение 10 и родовое предназначение 20 образуют конкретный рисунок. Вы видите, как эти энергии проявляются в решениях, работе и внутренней мотивации без подмены расчёта. ".repeat(5);
      const zoneParagraph = "Энергия проявляется в наблюдаемых решениях, отношениях и работе; вывод связан с рассчитанной позицией и не подменяет исходные числа. ".repeat(2);
      const zoneEnergy: Record<string, number> = {
        "Личность (день)": 3, "Талант (месяц)": 3, "Социум (год)": 8, "Задача": 14,
        "Центр": 10, "Внутренний центр": 11, "Деньги": 18, "Любовь": 12,
        "Социальность": 6, "Предназначение": 3,
      };
      return {
        text: headings.map((heading) => {
          const energy = zoneEnergy[heading];
          const zoneBody = energy
            ? `Суть энергии ${energy}. ${zoneParagraph}\n\n### В плюсе\n${zoneParagraph}\n\n### В минусе\n${zoneParagraph}\n\n### Практики\n${zoneParagraph}`
            : `${factParagraph}\n\n${factParagraph}\n\n${factParagraph}`;
          return `## ${heading}\n\n${zoneBody}`;
        }).join("\n\n"),
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
      generationParts: 7,
      numerology: expect.objectContaining({ lifePath: 5, expression: 5, soulUrge: 4 }),
    }));
    expect(result.text.length).toBeGreaterThan(5_000);
    expect(result.text).toContain("## Центр");
    expect(result.text).toContain("## Личное предназначение");
    expect(result.text).toContain("## Родовое предназначение");
    expect(mockAiComplete).toHaveBeenCalledTimes(7);
    expect(mockAiComplete.mock.calls.map(([request]) => request.requestId)).toEqual([
      "req-segmented:part-1",
      "req-segmented:part-2",
      "req-segmented:part-3",
      "req-segmented:part-4",
      "req-segmented:part-5",
      "req-segmented:part-6",
      "req-segmented:part-7",
    ]);
    for (const [request] of mockAiComplete.mock.calls) {
      const system = request.messages.find((message) => message.role === "system");
      expect(system?.content).toEqual(expect.stringContaining("СИСТЕМЕ МАТРИЦЫ СУДЬБЫ 22 ЭНЕРГИЙ"));
      expect(system?.content).not.toEqual(expect.stringContaining("ladini-lidrekon-v1"));
      expect(system?.content).toEqual(expect.stringContaining("центр 10"));
      expect(system?.content).toEqual(expect.stringContaining("родовое 20"));
    }
  });

  it("generates a three-card Tarot reading in five small reliable parts", async () => {
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
      generationParts: 5,
      cards: expect.arrayContaining([expect.objectContaining({ name: expect.any(String), position: expect.any(String) })]),
    }));
    expect(result.text).toContain("## Картина расклада");
    expect(result.text).toContain("## Связь карт и скрытая линия");
    expect(result.text).toContain("## Ответ расклада");
    expect(result.text).toContain("## Предупреждение карт");
    expect(result.text.match(/^## /gm)).toHaveLength(9);
    expect(mockAiComplete).toHaveBeenCalledTimes(5);
    expect(mockAiComplete.mock.calls.map(([request]) => request.requestId)).toEqual([
      "req-tarot:part-1",
      "req-tarot:part-2",
      "req-tarot:part-3",
      "req-tarot:part-4",
      "req-tarot:part-5",
    ]);
  });

  it("retries each Tarot segment that omitted one of its required headings", async () => {
    mockAiComplete.mockImplementation(async (request) => {
      const userMessage = request.messages.find((message) => message.role === "user");
      const content = typeof userMessage?.content === "string" ? userMessage.content : "";
      const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
      const selected = request.requestId?.endsWith("-repair") ? headings : headings.slice(0, 1);
      const body = "Конкретная трактовка карты, её символов, позиции и связи с вопросом о работе. ".repeat(18);
      return {
        text: selected.map((heading) => `## ${heading}\n\n${body}\n\n${body}\n\n${body}`).join("\n\n"),
        provider: "yandex" as never,
        model: "yandexgpt/latest",
        tokensIn: 500,
        tokensOut: 900,
        latencyMs: 120,
      };
    });

    const result = await generateSymbolicProductResult({
      productKey: "tarot",
      userInput: "Что показывает переход на новую работу?",
      tarotSpread: "three",
      tarotTheme: "Работа и призвание",
      userId: "user-tarot-repair",
      requestId: "req-tarot-repair",
    });

    expect(result.metadata).toEqual(expect.objectContaining({ source: "ai", generationParts: 9 }));
    expect(result.text.match(/^## /gm)).toHaveLength(9);
    expect(mockAiComplete).toHaveBeenCalledTimes(9);
    expect(mockAiComplete.mock.calls.map(([request]) => request.requestId)).toEqual([
      "req-tarot-repair:part-1",
      "req-tarot-repair:part-2",
      "req-tarot-repair:part-3",
      "req-tarot-repair:part-4",
      "req-tarot-repair:part-5",
      "req-tarot-repair:part-1-repair",
      "req-tarot-repair:part-2-repair",
      "req-tarot-repair:part-3-repair",
      "req-tarot-repair:part-4-repair",
    ]);
  });

  it("normalizes a model heading that was emitted inline after section prose", async () => {
    mockAiComplete.mockImplementation(async (request) => {
      const userMessage = request.messages.find((message) => message.role === "user");
      const content = typeof userMessage?.content === "string" ? userMessage.content : "";
      const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
      const body = "Подробная трактовка символа, позиции и связи с вопросом о работе. ".repeat(24);
      return {
        text: headings.map((heading) => `## ${heading}\n${body}`).join(" "),
        provider: "yandex" as never,
        model: "yandexgpt/latest",
        tokensIn: 500,
        tokensOut: 900,
        latencyMs: 120,
      };
    });

    const result = await generateSymbolicProductResult({
      productKey: "tarot",
      userInput: "Что показывает переход на новую работу?",
      tarotSpread: "three",
      tarotTheme: "Работа и призвание",
      userId: "user-tarot-inline",
      requestId: "req-tarot-inline",
    });

    expect(result.metadata).toEqual(expect.objectContaining({ source: "ai", generationParts: 5 }));
    expect(result.text.match(/^## /gm)).toHaveLength(9);
    expect(mockAiComplete).toHaveBeenCalledTimes(5);
  });
});
