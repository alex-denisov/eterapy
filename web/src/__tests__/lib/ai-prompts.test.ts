import db from "@/lib/db";
import {
  applyAIPromptOverride,
  defaultPromptTextForFeature,
  IMMUTABLE_AI_SAFETY_ENVELOPE,
  listAIPromptConfigs,
  mergeAIPromptOverride,
  serializeAIMessagesForAdmin,
  syncDefaultAIPromptConfigs,
} from "@/lib/ai-gateway/prompts";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    aIPromptConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
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
    (mockDb.aIPromptConfig.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: `prompt-${data.feature}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    (mockDb.aIPromptConfig.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
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

    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toBe(`${IMMUTABLE_AI_SAFETY_ENVELOPE}\n\nCustom prompt\n\nDefault prompt\n\nExtra rule`);
  });

  it("preserves runtime-calculated facts after an admin-managed prompt", () => {
    const feature = "product-numerology";
    const runtime = `${defaultPromptTextForFeature(feature)}\n\nРАССЧИТАННЫЕ ЧИСЛА: путь 5, выражение 5, душа 4.`;

    expect(mergeAIPromptOverride(feature, runtime, "Owner numerology prompt")).toBe(
      `${IMMUTABLE_AI_SAFETY_ENVELOPE}\n\nOwner numerology prompt\n\nРАССЧИТАННЫЕ ЧИСЛА: путь 5, выражение 5, душа 4.`,
    );
  });

  it("keeps runtime facts inside the explicit defaultPrompt placeholder", () => {
    const feature = "companion-chat";
    const runtime = `${defaultPromptTextForFeature(feature)}\n\nДОЛГОСРОЧНАЯ ПАМЯТЬ КЛИЕНТА: важный факт.`;

    expect(mergeAIPromptOverride(feature, runtime, "Before\n{{defaultPrompt}}\nAfter"))
      .toContain("ДОЛГОСРОЧНАЯ ПАМЯТЬ КЛИЕНТА: важный факт.");
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
    (mockDb.aIPromptConfig.findUnique as jest.Mock).mockImplementation(async ({ where }) => (
      where.feature === "product-tarot"
        ? {
          id: "prompt-product-tarot",
          feature: "product-tarot",
          title: "Old Tarot",
          productKey: "tarot",
          promptText: "You are ETerapy. Return ONLY valid JSON.",
          enabled: false,
          metadata: { defaultPromptRevision: "old" },
          createdAt: staleUpdatedAt,
          updatedAt: staleUpdatedAt,
        }
        : null
    ));

    await syncDefaultAIPromptConfigs();

    expect(mockDb.aIPromptConfig.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "prompt-product-tarot", updatedAt: staleUpdatedAt },
      data: expect.objectContaining({
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

  it("preserves prompts edited from superadmin during default sync", async () => {
    const editedAt = new Date("2026-07-09T00:00:00.000Z");
    (mockDb.aIPromptConfig.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "prompt-product-tarot",
          feature: "product-tarot",
          title: "Owner Tarot",
          productKey: "tarot",
          promptText: "Owner-edited tarot prompt",
          enabled: true,
          metadata: { promptSource: "admin", updatedBy: "superadmin-1" },
          createdAt: editedAt,
          updatedAt: editedAt,
        },
      ])
      .mockResolvedValueOnce([]);

    await syncDefaultAIPromptConfigs();

    expect(mockDb.aIPromptConfig.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "prompt-product-tarot" }),
    }));
  });

  it("does not overwrite an admin prompt saved after a stale sync snapshot", async () => {
    const staleAt = new Date("2026-07-09T00:00:00.000Z");
    const adminAt = new Date("2026-07-10T00:00:00.000Z");
    (mockDb.aIPromptConfig.findMany as jest.Mock)
      .mockResolvedValueOnce([{
        id: "prompt-product-tarot",
        feature: "product-tarot",
        title: "Old code default",
        productKey: "tarot",
        promptText: "Old default",
        enabled: true,
        metadata: { defaultPromptRevision: "old", promptSource: "code-default" },
        createdAt: staleAt,
        updatedAt: staleAt,
      }])
      .mockResolvedValueOnce([]);
    (mockDb.aIPromptConfig.findUnique as jest.Mock).mockImplementation(async ({ where }) => (
      where.feature === "product-tarot"
        ? {
          id: "prompt-product-tarot",
          feature: "product-tarot",
          title: "Owner Tarot",
          productKey: "tarot",
          promptText: "Owner-edited tarot prompt",
          enabled: true,
          metadata: { promptSource: "admin", updatedBy: "superadmin-1" },
          createdAt: staleAt,
          updatedAt: adminAt,
        }
        : null
    ));

    await syncDefaultAIPromptConfigs();

    expect(mockDb.aIPromptConfig.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "prompt-product-tarot" }),
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
