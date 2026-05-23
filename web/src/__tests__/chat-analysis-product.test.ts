import fs from "node:fs";
import path from "node:path";
import {
  ChatAnalysisInputError,
  maskChatAnalysisPii,
  validateChatScreenshotDataUrl,
} from "@/lib/chat-analysis";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B087/B088 chat analysis product", () => {
  it("wires the ChatAnalysisActions component into the product detail page", () => {
    const page = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/chat-analysis-actions.tsx");

    expect(page).toContain("<ChatAnalysisActions");
    expect(actions).toContain('data-testid="chat-analysis-actions"');
    expect(actions).toContain("/api/products/chat-analysis");
  });

  it("implements chat source upload, preview, and safe data handling", () => {
    const route = source("src/app/api/products/chat-analysis/route.ts");
    const helper = source("src/lib/chat-analysis.ts");
    
    // B087
    expect(route).toContain("z.literal(\"upload_preview\")");
    expect(route).toContain("z.literal(\"generate\")");
    expect(route).toContain("sourceText");
    expect(route).toContain("sourceText: maskedSourceText");
    
    // Generates anonymized version
    expect(route).toContain("buildChatAnalysisPreview");
    expect(route).toContain("maskChatAnalysisPii");
    expect(helper).toContain("Do not state the other person's intent as fact");
  });

  it("passes the user context note into generation and records it in metadata", () => {
    const route = source("src/app/api/products/chat-analysis/route.ts");
    const helper = source("src/lib/chat-analysis.ts");

    expect(route).toContain("contextNote: z.string()");
    expect(route).toContain("contextNote: input.contextNote");
    expect(route).toContain("analysisContextNote");
    expect(helper).toContain("contextNote?: string");
    expect(helper).toContain("Context from user before analysis:");
  });

  it("allows user to delete the raw source while keeping the result (B088)", () => {
    const itemRoute = source("src/app/api/products/chat-analysis/[id]/route.ts");
    
    expect(itemRoute).toContain("action: z.enum([\"save\", \"delete_source\"])");
    expect(itemRoute).toContain("sourceDeletedAt: new Date()");
    expect(itemRoute).toContain("sourceText: null");
    expect(itemRoute).toContain("recognizedText: null");
  });

  it("implements B211 screenshot OCR preview before analysis", () => {
    const route = source("src/app/api/products/chat-analysis/route.ts");
    const actions = source("src/components/products/chat-analysis-actions.tsx");
    const helper = source("src/lib/chat-analysis.ts");
    const taskPolicy = source("src/lib/ai-gateway/task-policy.ts");
    const domain = source("src/lib/ai-gateway/domain.ts");

    expect(route).toContain("z.literal(\"screenshot_preview\")");
    expect(route).toContain("extractChatTextFromScreenshot");
    expect(route).toContain("recognizedText: maskedSourceText");
    expect(route).toContain("imageStored: false");
    expect(actions).toContain("Распознанный текст");
    expect(actions).toContain("accept=\"image/png,image/jpeg,image/webp\"");
    expect(helper).toContain("feature: \"product-chat-analysis-ocr\"");
    expect(helper).toContain("{ type: \"image_url\"");
    expect(taskPolicy).toContain("product-chat-analysis-ocr");
    expect(domain).toContain("AIGatewayContentBlock");
  });

  it("validates screenshot data URLs and masks PII before storage", () => {
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.alloc(700, 1),
    ]);
    const parsed = validateChatScreenshotDataUrl(`data:image/png;base64,${pngBytes.toString("base64")}`);
    expect(parsed.mimeType).toBe("image/png");
    expect(parsed.byteLength).toBe(pngBytes.length);
    expect(parsed.sha256).toHaveLength(64);

    expect(() => validateChatScreenshotDataUrl("data:text/plain;base64,AAAA")).toThrow(ChatAnalysisInputError);

    const masked = maskChatAnalysisPii("Анна: мой телефон +7 999 123-45-67, email anna@example.com и https://example.com @anna");
    expect(masked).toContain("[телефон скрыт]");
    expect(masked).toContain("[email скрыт]");
    expect(masked).toContain("[ссылка скрыта]");
    expect(masked).toContain("[ник скрыт]");
  });
});
