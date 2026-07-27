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
      generationParts: 9,
      numerology: expect.objectContaining({ lifePath: 5, expression: 5, soulUrge: 4 }),
    }));
    expect(result.text.length).toBeGreaterThan(5_000);
    expect(result.text).toContain("## Центр");
    expect(result.text).toContain("## Личное предназначение");
    expect(result.text).toContain("## Родовое предназначение");
    expect(mockAiComplete).toHaveBeenCalledTimes(9);
    const directRequest = mockAiComplete.mock.calls[0][0].messages.find((message) => message.role === "user");
    expect(directRequest?.content).toEqual(expect.stringContaining("минимум 500 знаков"));
    expect(mockAiComplete.mock.calls.map(([request]) => request.requestId)).toEqual([
      "req-segmented:part-1",
      "req-segmented:part-2",
      "req-segmented:part-3",
      "req-segmented:part-4",
      "req-segmented:part-5",
      "req-segmented:part-6",
      "req-segmented:part-7",
      "req-segmented:part-8",
      "req-segmented:part-9",
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

  it("restores canonical Tarot card headings when the model declines card names", async () => {
    mockAiComplete.mockImplementation(async (request) => {
      const userMessage = request.messages.find((message) => message.role === "user");
      const content = typeof userMessage?.content === "string" ? userMessage.content : "";
      const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
      const body = "Конкретная трактовка карты, её позиции и связи с вопросом. ".repeat(24);
      return {
        text: headings.map((heading) => {
          const separator = heading.indexOf(":");
          const emitted = separator > 0 ? `${heading.slice(0, separator)}: название карты в другой форме` : heading;
          return `## ${emitted}\n\n${body}`;
        }).join("\n\n"),
        provider: "yandex" as never,
        model: "yandexgpt/latest",
        tokensIn: 500,
        tokensOut: 900,
        latencyMs: 120,
      };
    });

    const result = await generateSymbolicProductResult({
      productKey: "tarot",
      userInput: "Как подготовиться к важному разговору?",
      tarotSpread: "three",
      tarotTheme: "Любовь и отношения",
      userId: "user-tarot-inflection",
      requestId: "req-tarot-inflection",
    });

    expect(result.metadata).toEqual(expect.objectContaining({ source: "ai", generationParts: 5 }));
    expect(result.text).not.toContain("название карты в другой форме");
    expect(result.text.match(/^## /gm)).toHaveLength(9);
  });

  it("never ships the prompt context back as a section body", async () => {
    // Наблюдалось на staging (B554): модель приняла хвостовой блок контекста за
    // содержимое `## Картина расклада`, и служебный текст «Услуга: …/Выпавшие
    // карты: …» уехал в платный результат клиента.
    const body = "Конкретная трактовка карты, её позиции и связи с вопросом. ".repeat(24);
    mockAiComplete.mockImplementation(async (request) => {
      const userMessage = request.messages.find((message) => message.role === "user");
      const content = typeof userMessage?.content === "string" ? userMessage.content : "";
      const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
      const context = content.slice(content.indexOf("Услуга: "));
      const echoed = request.requestId?.endsWith("-repair") ? null : "Картина расклада";
      return {
        text: headings
          .map((heading) => `## ${heading}\n\n${heading === echoed ? context : body}`)
          .join("\n\n"),
        provider: "yandex" as never,
        model: "yandexgpt/latest",
        tokensIn: 500,
        tokensOut: 900,
        latencyMs: 120,
      };
    });

    const result = await generateSymbolicProductResult({
      productKey: "tarot",
      userInput: "Что помогает мне двигаться дальше?",
      tarotSpread: "three",
      tarotTheme: "Самопознание",
      userId: "user-tarot-echo",
      requestId: "req-tarot-echo",
    });

    expect(result.text).not.toContain("Услуга: ");
    expect(result.text).not.toContain("Выпавшие карты:");
    expect(result.text).not.toContain("Данные для разбора:");
    expect(result.text).toContain("## Картина расклада");
    expect(result.text.match(/^## /gm)).toHaveLength(9);
  });

  it("repairs the exact surname layer named by the quality gate", async () => {
    const richHeadings = new Set([
      "Главный ресурс рода",
      "Родовая тень",
      "Деньги и реализация",
      "Отношения, границы и семейная роль",
    ]);
    mockAiComplete.mockImplementation(async (request) => {
      const userMessage = request.messages.find((message) => message.role === "user");
      const content = typeof userMessage?.content === "string" ? userMessage.content : "";
      const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
      const exactFacts = "Романова: сумма 39, код 3, XVII Звезда. Волкова: сумма 28, код 1, VI Влюблённые. Вариант усиливает инициативу, ослабляет созерцательность; цена перехода — больше личной ответственности. ";
      const compactBody = exactFacts.repeat(4);
      const longBody = exactFacts.repeat(10);
      const richBody = [
        `### В плюсе\n${longBody}`,
        `### В минусе\n${longBody}`,
        `### Как проверить у себя\n${longBody}`,
        `### Практики\n${longBody}`,
      ].join("\n\n");
      const isRepair = request.requestId?.endsWith(":repair");

      return {
        text: headings.map((heading) => {
          if (heading === "Главный ресурс рода" && !isRepair) {
            return `## ${heading}\n\n${exactFacts.repeat(5)}`;
          }
          if (richHeadings.has(heading)) return `## ${heading}\n\n${richBody}`;
          if (["Прямой ответ", "Формула фамилии", "Код рода — 3: Звезда"].includes(heading)) {
            return `## ${heading}\n\n${longBody}`;
          }
          return `## ${heading}\n\n${compactBody}`;
        }).join("\n\n"),
        provider: "yandex" as never,
        model: "yandexgpt/latest",
        tokensIn: 500,
        tokensOut: 900,
        latencyMs: 120,
      };
    });

    const result = await generateSymbolicProductResult({
      productKey: "surname-origin",
      userInput: [
        "Режим: change",
        "Фамилия: Романова",
        "Новая фамилия: Волкова",
        "Фокус: деньги",
        "Контекст: Что усилится после смены фамилии?",
      ].join("\n"),
      userId: "user-surname-repair",
      requestId: "req-surname-repair",
    });

    expect(result.metadata).toEqual(expect.objectContaining({ source: "ai", generationParts: 5 }));
    expect(result.text).toContain("## Главный ресурс рода");
    expect(result.text).toContain("### Как проверить у себя");
    expect(mockAiComplete).toHaveBeenCalledTimes(5);
    const repairRequest = mockAiComplete.mock.calls.at(-1)?.[0];
    expect(repairRequest?.requestId).toBe("req-surname-repair:repair");
    expect(repairRequest?.messages.find((message) => message.role === "user")?.content)
      .toEqual(expect.stringContaining("## Главный ресурс рода"));
  });
});
