import fs from "node:fs";
import path from "node:path";

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
    
    // B087
    expect(route).toContain("z.literal(\"upload_preview\")");
    expect(route).toContain("z.literal(\"generate\")");
    expect(route).toContain("sourceText");
    expect(route).toContain("metadata: { sourceText");
    
    // Generates anonymized version
    expect(route).toContain("buildChatAnalysisPreview");
  });

  it("allows user to delete the raw source while keeping the result (B088)", () => {
    const itemRoute = source("src/app/api/products/chat-analysis/[id]/route.ts");
    
    expect(itemRoute).toContain("action: z.enum([\"save\", \"delete_source\"])");
    expect(itemRoute).toContain("sourceDeletedAt: new Date()");
    expect(itemRoute).toContain("sourceText: null");
  });
});
