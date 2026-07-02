import fs from "fs";
import path from "path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B203 Practice and missions", () => {
  it("tracks daily practice completion and reflection in the schema", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260512215500_add_daily_practice_completion/migration.sql");

    expect(schema).toMatch(/completedAt\s+DateTime\?/);
    expect(schema).toMatch(/reflectionText\s+String\?/);
    expect(migration).toContain("completed_at");
    expect(migration).toContain("reflection_text");
  });

  it("grants exactly one clarity credit when daily practice is completed", () => {
    const route = source("src/app/api/cabinet/daily-card/route.ts");

    expect(route).toContain('payload?.action === "complete"');
    // B375: баллы идут по вехам серии (STREAK_REWARDS в lib/streaks.ts),
    // а не +1 за каждый день — начисление живёт в bumpPracticeStreak.
    expect(route).toContain("bumpPracticeStreak");
    expect(route).not.toContain("recordClarityCreditEntry");
    const streaks = source("src/lib/streaks.ts");
    expect(streaks).toContain('source: "daily_practice"');
    expect(streaks).toContain("existingCreditReward");
  });

  it("surfaces practice, balance, and gentle rhythm in the client cabinet", () => {
    const dashboard = source("src/app/cabinet/page.tsx");
    const actions = source("src/components/cabinet/daily-practice-actions.tsx");

    expect(dashboard).toContain("getClarityCreditBalance");
    expect(dashboard).toContain("<DailyPracticeActions");
    expect(dashboard).toContain('data-testid="client-dashboard-balance"');
    // B464 IB1: balance reframed as *spendable* («N баллов · на что потратить»).
    expect(dashboard).toContain("на что потратить");
    expect(actions).toContain('action: "complete"');
    expect(actions).toContain("+1 балл");
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

  it("T20: surfaces взгляд дня and маленький шаг in the full practice ritual", () => {
    const page = source("src/app/cabinet/practice/page.tsx");
    const actions = source("src/components/cabinet/daily-practice-actions.tsx");

    expect(page).toContain('variant="full"');
    expect(page).toContain("dailyCardBeats");
    expect(actions).toContain("взгляд дня");
    expect(actions).toContain("маленький шаг");
    expect(actions).toContain("practice-reflection-input");
  });

  it("retires the daily-practice PRODUCT page; daily practice is the cabinet block (B373)", () => {
    // B287 retired /products/missions. B373 (M26) fully retires the daily-practice
    // PRODUCT page too: the daily ritual is a free dashboard/cabinet block (B375), not a
    // sellable product. The public route 404s via the proxy (unknownProductSlug derives
    // from v5Products); the /cabinet/practice surface (read in the T20 test above) stays.
    const productPage = source("src/lib/v5-products.ts");
    const seo = source("src/lib/seo.ts");
    const publicSeo = source("src/lib/public-page-seo.ts");
    const proxy = source("src/proxy.ts");

    expect(productPage).not.toContain('slug: "clarity-practice"');
    expect(seo).not.toContain('"/products/clarity-practice"');
    expect(publicSeo).not.toContain('"/products/clarity-practice"');
    expect(seo).not.toContain('"/products/missions"');
    expect(proxy).toContain("unknownProductSlug");
  });
});
