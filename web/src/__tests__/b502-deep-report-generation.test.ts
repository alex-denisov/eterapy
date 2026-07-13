import { aiComplete } from "@/lib/ai";
import { DEEP_REPORT_SECTIONS, generateDeepReport } from "@/lib/deep-report";
import fs from "node:fs";
import path from "node:path";

jest.mock("@/lib/ai", () => ({ aiComplete: jest.fn() }));

const mockAiComplete = aiComplete as jest.MockedFunction<typeof aiComplete>;

describe("B502 detailed report controlled generation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAiComplete.mockImplementation(async (request) => {
      const userMessage = String(request.messages.findLast((message) => message.role === "user")?.content ?? "");
      const titles = DEEP_REPORT_SECTIONS.filter((title) => userMessage.includes(`## ${title}`));
      const body = "Конкретный персональный анализ ситуации, фактов, механизма, вариантов и инструкции к применению. ".repeat(55);
      return {
        text: titles.map((title) => `## ${title}\n${body}`).join("\n\n"),
        provider: "openai" as never,
        model: "gpt-test",
        tokensIn: 100,
        tokensOut: 900,
        latencyMs: 50,
      };
    });
  });

  it("assembles eight validated single-section parts into one long ordered report", async () => {
    const generated = await generateDeepReport({
      sourceText: "Начальник постоянно критикует мою работу, я теряюсь и боюсь разговора о границах.",
      contextNote: "О чём: работа\nЦель разбора: план действий",
      userId: "user-1",
      requestId: "req-1",
    });

    expect(mockAiComplete).toHaveBeenCalledTimes(8);
    expect(generated.metadata).toEqual(expect.objectContaining({ source: "ai", parts: 8 }));
    for (const title of DEEP_REPORT_SECTIONS) expect(generated.text).toContain(`## ${title}`);
    expect(generated.text.split(/\s+/u).length).toBeGreaterThan(2_800);
  });

  it("does not save or charge a short heuristic fallback as a completed report", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/products/deep-report/route.ts"), "utf8");
    expect(route).toContain("AI_UNAVAILABLE");
    expect(route.indexOf('full.metadata as { source?: string }')).toBeLessThan(route.indexOf("db.$transaction"));
  });

  it("keeps a valid short first pass and appends a non-duplicating supplement", async () => {
    mockAiComplete.mockImplementation(async (request) => {
      const userMessage = String(request.messages.findLast((message) => message.role === "user")?.content ?? "");
      const title = DEEP_REPORT_SECTIONS.find((candidate) => userMessage.includes(`## ${candidate}`))!;
      const repeats = userMessage.includes("ДОПОЛНЕНИЕ") ? 30 : 25;
      const body = "Новый конкретный факт, вывод и практическая инструкция для вашей ситуации. ".repeat(repeats);
      return {
        text: `## ${title}\n${body}`,
        provider: "openai" as never,
        model: "gpt-test",
        tokensIn: 100,
        tokensOut: 500,
        latencyMs: 50,
      };
    });

    const generated = await generateDeepReport({
      sourceText: "Я выбираю между сохранением работы и переходом в другую компанию, но боюсь ошибиться.",
      userId: "user-2",
      requestId: "req-2",
    });

    expect(mockAiComplete).toHaveBeenCalledTimes(16);
    expect(generated.metadata).toEqual(expect.objectContaining({ source: "ai", parts: 8, generationCalls: 16 }));
    expect(generated.text.split(/\s+/u).length).toBeGreaterThan(2_800);
  });
});
