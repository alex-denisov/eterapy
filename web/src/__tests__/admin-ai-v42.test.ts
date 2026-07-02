import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B229 admin AI v4.2 routing console", () => {
  it("surfaces v4.2 LLM routing guardrails without weakening RBAC", () => {
    const page = source("src/app/admin/ai/admin-ai-page.tsx");
    const center = source("src/app/admin/ai/ai-control-center.tsx");
    const route = source("src/app/api/admin/ai/control/route.ts");
    const adminConfig = source("src/lib/ai-gateway/admin-config.ts");

    expect(page).toContain("ai.configure");
    expect(page).toContain("маршрутизация LLM · контроль затрат");
    expect(page).toContain("free, paid, sensitive, speech");
    expect(page).not.toContain("font-heading text-2xl font-bold");
    expect(center).toContain('data-testid="admin-ai-v42-guardrails"');
    expect(center).toContain('data-testid="admin-ai-ops-metrics"');
    expect(center).toContain('data-testid="admin-ai-prompts"');
    expect(center).toContain('data-testid="admin-ai-interactions"');
    expect(center).toContain('data-testid="admin-ai-model-costs"');
    expect(page).toContain("<AdminCurrencySelector");
    expect(center).toContain('currency: DisplayCurrency');
    expect(center).toContain('const perMillionUnit = currency === "USD" ? "$/1 млн" : "₽/1 млн";');
    expect(center).toContain('label={`Вход, ${perMillionUnit}`}');
    expect(center).toContain('label={`Выход, ${perMillionUnit}`}');
    expect(center).toContain("provider default");
    expect(center).toContain("reference/free");
    expect(center).toContain("MODEL_PRICING_REFERENCE_USD_PER_MILLION");
    expect(center).toContain("providerOrderWithAllProviders");
    expect(center).toContain("modelPreferencesWithRecommendations");
    expect(center).toContain("credentialOverrides");
    expect(center).toContain("<datalist");
    expect(center).toContain("Рекомендовано:");
    expect(center).toContain("TABLE_PAGE_SIZE = 25");
    expect(center).toContain("<PaginationBar");
    expect(center).toContain("data-testid=\"ai-credentials-create-manual\"");
    expect(center).not.toContain("data-testid=\"ai-policy-form\"");
    expect(center).not.toContain("ModelPricingPreview");
    expect(center).toContain("бесплатный слой");
    expect(center).toContain("платный слой");
    expect(center).toContain("контур аудита");
    expect(center).toContain("GEMINI");
    expect(route).toContain("updateAIRoutingPolicy");
    expect(route).toContain("cloudflareGatewayEnabled");
    expect(adminConfig).toContain("AI_ROUTING_POLICY_UPDATE");
    expect(adminConfig).toContain("listAIPromptConfigs");
  });
});
