import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Admin owner finance overview", () => {
  it("surfaces owner-grade financial liabilities and revenue splits", () => {
    const overview = source("src/app/admin/page.tsx");
    expect(overview).toContain("Финансовые метрики");
    // V5: rendered as grouped metric cards — labels shortened, metrics retained.
    expect(overview).toContain("Hold / escrow");
    expect(overview).toContain("Ожидает выплаты");
    expect(overview).toContain("Потенциальные возвраты");
    expect(overview).toContain("practitionerSubscriptionRevenueRub");
    expect(overview).toContain("clientSubscriptionRevenueRub");
    // Z1-Ф1: the client ₽ balance rail is removed — no ₽ top-up / manual-credit
    // liability lines, no user-balance liability metric.
    expect(overview).not.toContain("Пополнения через эквайер");
    expect(overview).not.toContain("Ручные начисления");
    expect(overview).not.toContain("totalBalanceRub");
  });

  it("Z1-Ф1: drops the manual ₽-balance adjustment action from the user API", () => {
    const route = source("src/app/api/admin/users/[id]/route.ts");
    expect(route).not.toContain('case "update_balance"');
    expect(route).not.toContain("const delta = kopecks - targetUser.balance");
    // the client credit-grant action remains (the credit-centric currency)
    expect(route).toContain('case "update_clarity_credits"');
  });
});
