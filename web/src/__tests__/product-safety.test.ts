import { classifyDialogueSafety } from "@/lib/dialogue-safety";
import { classifyProductSafety, PRODUCT_BLOCKED_MESSAGE, PRODUCT_CRISIS_MESSAGE } from "@/lib/product-safety";

jest.mock("@/lib/dialogue-safety", () => ({
  classifyDialogueSafety: jest.fn(),
  shouldInterruptDialogue: (level: string) => level === "crisis" || level === "blocked",
}));

jest.mock("@/lib/logger", () => ({
  log: { warn: jest.fn() },
}));

const mockedClassifier = classifyDialogueSafety as jest.MockedFunction<typeof classifyDialogueSafety>;

describe("symbolic product safety gate", () => {
  const input = { text: "текст", productKey: "tarot", userId: "user-1", requestId: "request-1" };

  beforeEach(() => jest.clearAllMocks());

  it("interrupts crisis before a paid symbolic reading", async () => {
    mockedClassifier.mockResolvedValue({ level: "crisis", reason: "immediate_risk", confidence: 0.99, source: "ai" });
    await expect(classifyProductSafety(input)).resolves.toMatchObject({ interrupted: true, message: PRODUCT_CRISIS_MESSAGE });
  });

  it("interrupts harmful requests with a bounded message", async () => {
    mockedClassifier.mockResolvedValue({ level: "blocked", reason: "harm", confidence: 0.99, source: "heuristic" });
    await expect(classifyProductSafety(input)).resolves.toMatchObject({ interrupted: true, message: PRODUCT_BLOCKED_MESSAGE });
  });

  it("allows normal and sensitive life questions to continue under product guardrails", async () => {
    mockedClassifier.mockResolvedValue({ level: "sensitive", reason: "financial_context", confidence: 0.8, source: "ai" });
    await expect(classifyProductSafety(input)).resolves.toMatchObject({ interrupted: false, message: null });
  });
});
