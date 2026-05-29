import fs from "fs";
import path from "path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B203 Practice and missions", () => {
  it("tracks daily practice completion and reflection in the schema", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260512215500_add_daily_practice_completion/migration.sql");

    expect(schema).toContain("completedAt DateTime?");
    expect(schema).toContain("reflectionText String?");
    expect(migration).toContain("completed_at");
    expect(migration).toContain("reflection_text");
  });

  it("grants exactly one clarity credit when daily practice is completed", () => {
    const route = source("src/app/api/cabinet/daily-card/route.ts");

    expect(route).toContain('payload?.action === "complete"');
    expect(route).toContain("recordClarityCreditEntry");
    expect(route).toContain('source: "daily_practice"');
    expect(route).toContain('sourceEventId: card.id');
    expect(route).toContain("existingReward");
  });

  it("surfaces practice, credits, and gentle rhythm in the client cabinet", () => {
    const dashboard = source("src/app/cabinet/page.tsx");
    const actions = source("src/components/cabinet/daily-practice-actions.tsx");

    expect(dashboard).toContain("getClarityCreditBalance");
    expect(dashboard).toContain("<DailyPracticeActions");
    expect(dashboard).toContain("Кредиты ясности");
    expect(actions).toContain('action: "complete"');
    expect(actions).toContain("+1 кредит ясности");
  });

  it("T20: builds the daily card as a monitored LLM three-beat ritual with a deterministic fallback", () => {
    const lib = source("src/lib/daily-card.ts");
    const policy = source("src/lib/ai-gateway/task-policy.ts");

    // Question → perspective → step generated through the monitored gateway feature.
    expect(lib).toContain("generateDailyPracticeContent");
    expect(lib).toContain('feature: "daily-practice"');
    expect(lib).toContain("perspective");
    expect(lib).toContain("step");
    // Deterministic fallback templates must carry all three beats.
    expect(lib).toContain("dailyCardBeats");
    expect(lib).toContain('source: "deterministic_v1"');

    // Registered in the superadmin AI-центр task policies so it is configurable + monitored.
    expect(policy).toContain('feature: "daily-practice"');
  });

  it("T20: surfaces ракурс дня and маленький шаг in the full practice ritual", () => {
    const page = source("src/app/cabinet/practice/page.tsx");
    const actions = source("src/components/cabinet/daily-practice-actions.tsx");

    expect(page).toContain('variant="full"');
    expect(page).toContain("dailyCardBeats");
    expect(actions).toContain("ракурс дня");
    expect(actions).toContain("маленький шаг");
    expect(actions).toContain("practice-reflection-input");
  });

  it("keeps clarity-practice as the single public daily-practice entry", () => {
    // /products/missions was retired in B287 — there is one canonical
    // product surface (/products/clarity-practice) and one cabinet
    // surface (/cabinet/practice — renamed from /cabinet/modalities in
    // B306) for the daily ritual.
    const productPage = source("src/lib/v5-products.ts");
    const seo = source("src/lib/seo.ts");
    const publicSeo = source("src/lib/public-page-seo.ts");

    expect(productPage).toContain('slug: "clarity-practice"');
    expect(seo).toContain('"/products/clarity-practice"');
    expect(publicSeo).toContain('"/products/clarity-practice"');
    expect(seo).not.toContain('"/products/missions"');
  });
});
