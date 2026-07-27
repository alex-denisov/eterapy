import { aiComplete } from "@/lib/ai";
import {
  classifyDialogueSafety,
  heuristicDialogueSafety,
  parseDialogueSafetyResponse,
  shouldInterruptDialogue,
} from "@/lib/dialogue-safety";

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

describe("dialogue-safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses strict JSON safety output", () => {
    expect(parseDialogueSafetyResponse('{"level":"sensitive","reason":"medical","confidence":0.8}')).toEqual({
      level: "sensitive",
      reason: "medical",
      confidence: 0.8,
    });
  });

  it("detects crisis markers with heuristic fallback", () => {
    expect(heuristicDialogueSafety("Я думаю покончить с собой")).toEqual(expect.objectContaining({
      level: "crisis",
      source: "heuristic",
    }));
    expect(shouldInterruptDialogue("crisis")).toBe(true);
    expect(shouldInterruptDialogue("sensitive")).toBe(false);
  });

  it("classifies safety through AI Gateway", async () => {
    mockAiComplete.mockResolvedValue({
      text: '{"level":"blocked","reason":"harmful_request","confidence":0.88}',
      provider: "openai",
      model: "gpt-4o-mini",
      tokensIn: 30,
      tokensOut: 12,
      latencyMs: 60,
    });

    await expect(classifyDialogueSafety({
      question: "unsafe request",
      userId: "user-1",
      requestId: "req-1",
    })).resolves.toEqual({
      level: "blocked",
      reason: "harmful_request",
      confidence: 0.88,
      source: "ai",
      provider: "openai",
      model: "gpt-4o-mini",
    });
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      // B362/Механика 7: hyphenated key so the admin prompt + routing policy apply.
      feature: "safety-classification",
      userId: "user-1",
      requestId: "req-1",
      maxTokens: 140,
      temperature: 0,
    }));
  });

  it("B601: сбой классификатора не объявляет здорового человека «в кризисе»", async () => {
    // Раньше недоступность модели давала `sensitive`, а `sensitive` глушит
    // рекомендации и показывает «если сейчас непросто» тому, кто спросил про
    // работу. Теперь при сбое отвечает детерминированная оценка риска.
    mockAiComplete.mockRejectedValue(new Error("provider unavailable"));

    await expect(classifyDialogueSafety({
      question: "Как выбрать работу?",
      requestId: "req-1",
    })).resolves.toEqual({
      level: "normal",
      reason: "no_marker",
      confidence: 0.55,
      source: "heuristic",
    });
  });

  it("B601: сбой классификатора НЕ снимает явную угрозу — её ловит шкала", async () => {
    mockAiComplete.mockRejectedValue(new Error("provider unavailable"));

    await expect(classifyDialogueSafety({
      question: "я хочу себя убить, уже всё решил",
      requestId: "req-2",
    })).resolves.toEqual(expect.objectContaining({
      level: "crisis",
      source: "heuristic",
    }));
  });
});
