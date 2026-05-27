import db from "@/lib/db";
import {
  applyAIPromptOverride,
  listAIPromptConfigs,
  serializeAIMessagesForAdmin,
} from "@/lib/ai-gateway/prompts";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    aIPromptConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { warn: jest.fn() },
  serializeError: jest.fn((err) => ({ message: err instanceof Error ? err.message : String(err) })),
}));

const mockDb = db as jest.Mocked<typeof db>;

describe("AI prompt configs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.aIPromptConfig.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.aIPromptConfig.findUnique as jest.Mock).mockResolvedValue(null);
  });

  it("lists editable default prompts for product features", async () => {
    const prompts = await listAIPromptConfigs();

    expect(prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        feature: "dialogue-primary-answer",
        source: "default",
        productKey: "checkin",
      }),
      expect.objectContaining({
        feature: "product-deep-report",
        source: "default",
      }),
    ]));
  });

  it("replaces the system message with enabled database prompt text", async () => {
    (mockDb.aIPromptConfig.findUnique as jest.Mock).mockResolvedValue({
      id: "prompt-1",
      feature: "dialogue-primary-answer",
      title: "Free answer",
      productKey: "checkin",
      promptText: "Custom prompt\n\n{{defaultPrompt}}\n\nExtra rule",
      enabled: true,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const messages = await applyAIPromptOverride("dialogue-primary-answer", [
      { role: "system", content: "Default prompt" },
      { role: "user", content: "Вопрос" },
    ]);

    expect(messages[0]).toEqual({
      role: "system",
      content: "Custom prompt\n\nDefault prompt\n\nExtra rule",
    });
  });

  it("serializes image messages without storing raw base64 screenshots", () => {
    const serialized = serializeAIMessagesForAdmin([
      {
        role: "user",
        content: [
          { type: "text", text: "Recognize this" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ],
      },
    ]);

    expect(JSON.stringify(serialized)).toContain("hasImage");
    expect(JSON.stringify(serialized)).toContain("image/png");
    expect(JSON.stringify(serialized)).not.toContain("AAAA");
  });
});
