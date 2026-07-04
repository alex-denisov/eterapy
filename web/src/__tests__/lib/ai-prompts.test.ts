import db from "@/lib/db";
import {
  applyAIPromptOverride,
  defaultPromptTextForFeature,
  listAIPromptConfigs,
  serializeAIMessagesForAdmin,
  syncDefaultAIPromptConfigs,
} from "@/lib/ai-gateway/prompts";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    aIPromptConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
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
    (mockDb.aIPromptConfig.upsert as jest.Mock).mockImplementation(async ({ create, update, where }) => ({
      id: `prompt-${where.feature}`,
      ...create,
      ...update,
      metadata: update?.metadata ?? create.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
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
      expect.objectContaining({
        feature: "product-tarot",
        source: "default",
        productKey: "tarot",
      }),
    ]));
    const clarifier = prompts.find((prompt) => prompt.feature === "dialogue-clarifier");
    expect(clarifier?.promptText).toContain("Rust");
    expect(clarifier?.promptText).toContain("JSON");
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

  it("syncs stale database prompts to the current Russian default revision without re-enabling disabled prompts", async () => {
    const staleUpdatedAt = new Date("2026-06-01T00:00:00.000Z");
    (mockDb.aIPromptConfig.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "prompt-product-tarot",
          feature: "product-tarot",
          title: "Old Tarot",
          productKey: "tarot",
          promptText: "You are ETerapy. Return ONLY valid JSON.",
          enabled: false,
          metadata: { defaultPromptRevision: "old" },
          createdAt: staleUpdatedAt,
          updatedAt: staleUpdatedAt,
        },
      ])
      .mockResolvedValueOnce([]);

    await syncDefaultAIPromptConfigs();

    expect(mockDb.aIPromptConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { feature: "product-tarot" },
      update: expect.objectContaining({
        title: "Расклад Таро",
        productKey: "tarot",
        promptText: defaultPromptTextForFeature("product-tarot"),
        enabled: false,
        metadata: expect.objectContaining({
          defaultPromptRevision: expect.any(String),
          promptSource: "code-default",
        }),
      }),
    }));
  });

  it("uses a Russian fallback prompt for unknown custom features", () => {
    const fallback = defaultPromptTextForFeature("custom-experimental-flow");

    expect(fallback).toContain("текущий системный промт ETerapy");
    expect(fallback).not.toMatch(/Use the current ETerapy|You may include/i);
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
