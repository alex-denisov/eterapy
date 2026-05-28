import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B229 admin AI v4.2 routing console", () => {
  it("surfaces v4.2 LLM routing guardrails without weakening RBAC", () => {
    const page = source("src/app/admin/ai/page.tsx");
    const center = source("src/app/admin/ai/ai-control-center.tsx");
    const route = source("src/app/api/admin/ai/control/route.ts");
    const adminConfig = source("src/lib/ai-gateway/admin-config.ts");

    expect(page).toContain("ai.configure");
    expect(page).toContain("llm routing · cost control");
    expect(page).toContain("free, paid, sensitive, speech");
    expect(page).not.toContain("font-heading text-2xl font-bold");
    expect(center).toContain('data-testid="admin-ai-v42-guardrails"');
    expect(center).toContain('data-testid="admin-ai-ops-metrics"');
    expect(center).toContain('data-testid="admin-ai-prompts"');
    expect(center).toContain('data-testid="admin-ai-interactions"');
    expect(center).toContain('data-testid="admin-ai-model-costs"');
    expect(center).toContain("Input $/1M");
    expect(center).toContain("Output $/1M");
    expect(center).toContain("provider default");
    expect(center).toContain("TABLE_PAGE_SIZE = 25");
    expect(center).toContain("<PaginationBar");
    expect(center).toContain("data-testid=\"ai-credentials-create-manual\"");
    expect(center).not.toContain("data-testid=\"ai-policy-form\"");
    expect(center).not.toContain("ModelPricingPreview");
    expect(center).toContain("free layer");
    expect(center).toContain("paid layer");
    expect(center).toContain("audit boundary");
    expect(center).toContain("GEMINI");
    expect(route).toContain("updateAIRoutingPolicy");
    expect(route).toContain("cloudflareGatewayEnabled");
    expect(adminConfig).toContain("AI_ROUTING_POLICY_UPDATE");
    expect(adminConfig).toContain("listAIPromptConfigs");
  });
});
