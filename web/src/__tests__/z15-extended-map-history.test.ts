import { aiComplete } from "@/lib/ai";
import fs from "node:fs";
import path from "node:path";
import { listMyMapItems, type MyMapItem } from "@/lib/my-map";
import {
  MIN_EXTENDED_MAP_ITEMS,
  buildExtendedMapTeaser,
  generateExtendedMapResult,
} from "@/lib/extended-map";

jest.mock("@/lib/ai", () => ({
  aiComplete: jest.fn(),
}));

jest.mock("@/lib/my-map", () => ({
  listMyMapItems: jest.fn(),
}));

const mockAiComplete = aiComplete as jest.MockedFunction<typeof aiComplete>;
const mockListMyMapItems = listMyMapItems as jest.MockedFunction<typeof listMyMapItems>;
const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function item(id: string, patch: Partial<MyMapItem> = {}): MyMapItem {
  return {
    kind: "dialogue",
    id,
    title: `Вопрос ${id}`,
    eyebrow: "Вопрос",
    description: "Повторяется тема границ и выбора без спешки.",
    bodyMarkdown: "Я снова сомневаюсь, как говорить о границах и не уходить в вину.",
    href: `/checkin?dialogueId=${id}`,
    updatedAt: new Date(`2026-06-0${id.length}T10:00:00Z`),
    status: "COMPLETED",
    exportText: "Вопрос: границы",
    shareTopic: "relationships",
    topic: "relationships",
    topicLabel: "Отношения",
    hidden: false,
    ...patch,
  };
}

describe("Z15 extended map from history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires at least three map history items and does not call AI for the empty state", async () => {
    mockListMyMapItems.mockResolvedValueOnce([item("a"), item("bb")]);

    const result = await generateExtendedMapResult({ userId: "user-1", requestId: "req-1" });

    expect(MIN_EXTENDED_MAP_ITEMS).toBe(3);
    expect(result.status).toBe("insufficient_history");
    if (result.status !== "insufficient_history") throw new Error("Expected insufficient map history");
    expect(result.itemCount).toBe(2);
    expect(result.missingCount).toBe(1);
    expect(result.emptyState).toContain("3");
    expect(mockAiComplete).not.toHaveBeenCalled();
  });

  it("generates the full map from listMyMapItems through the product-my-map AI feature", async () => {
    mockListMyMapItems.mockResolvedValueOnce([
      item("a", { title: "Отношения и границы" }),
      item("bb", { title: "Работа и голос", topicLabel: "Работа", shareTopic: "career" }),
      item("ccc", { title: "Семья и вина", topicLabel: "Семья", shareTopic: "family" }),
    ]);
    mockAiComplete.mockResolvedValueOnce({
      text: [
        "Расширенная карта ETerapy",
        "",
        "Центральная тема: вы чаще всего возвращались к границам, голосу и праву выбирать темп.",
        "Что стало тише: необходимость объяснять всё сразу.",
        "Следующий шаг: выбрать один разговор, где можно говорить короче и честнее.",
      ].join("\n"),
      provider: "openai" as never,
      model: "gpt-test",
      tokensIn: 220,
      tokensOut: 180,
      latencyMs: 75,
    });

    const result = await generateExtendedMapResult({ userId: "user-1", requestId: "req-1" });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready extended map");
    expect(result.text).toContain("Центральная тема");
    expect(result.itemCount).toBe(3);
    expect(result.metadata).toEqual(expect.objectContaining({
      source: "ai",
      provider: "openai",
      sourceItemCount: 3,
      sourceItemIds: ["a", "bb", "ccc"],
    }));
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "product-my-map",
      userId: "user-1",
    }));
    expect(mockAiComplete.mock.calls[0]?.[0].messages.at(-1)?.content).toContain("Отношения и границы");
  });

  it("builds a one-theme teaser from the generated map", () => {
    const teaser = buildExtendedMapTeaser({
      items: [item("a"), item("bb"), item("ccc")],
      generatedText: "Центральная тема: границы стали главным повтором.\nСледующий шаг: говорить короче.",
    });

    expect(teaser).toContain("1 тема");
    expect(teaser).toContain("границы");
    expect(teaser).toContain("Полная расширенная карта");
  });

  it("wires the symbolic API and UI to history-driven extended map generation", () => {
    const route = source("src/app/api/products/symbolic/route.ts");
    const actions = source("src/components/products/symbolic-product-actions.tsx");
    const detailPage = source("src/app/products/[slug]/page.tsx");

    expect(route).toContain('if (productKey === "my-map")');
    expect(route).toContain("generateExtendedMapResult");
    expect(route).toContain("buildExtendedMapTeaser");
    expect(route).toContain("insufficientHistory");

    expect(actions).toContain('const historyDriven = productKey === "my-map"');
    expect(actions).toContain('data-testid="extended-map-history-state"');
    expect(actions).toContain("mapItemCount");
    expect(actions).toContain("insufficientHistory");
    expect(actions).toContain('authStatus !== "authenticated"');
    expect(actions).toContain("!historyDriven &&");
    expect(detailPage).toContain("p-6 sm:p-10");
    expect(detailPage).toContain("max-w-80");
  });
});
