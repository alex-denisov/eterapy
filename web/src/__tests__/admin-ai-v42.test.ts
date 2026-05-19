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
    expect(center).toContain("free layer");
    expect(center).toContain("paid layer");
    expect(center).toContain("human boundary");
    expect(route).toContain("updateAIRoutingPolicy");
    expect(adminConfig).toContain("AI_ROUTING_POLICY_UPDATE");
  });
});
