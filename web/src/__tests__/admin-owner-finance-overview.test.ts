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
    expect(overview).toContain("Пополнения через эквайер");
    expect(overview).toContain("Ручные начисления");
    expect(overview).toContain("practitionerSubscriptionRevenueRub");
    expect(overview).toContain("clientSubscriptionRevenueRub");
  });

  it("records manual balance adjustments as auditable manual transactions", () => {
    const route = source("src/app/api/admin/users/[id]/route.ts");
    expect(route).toContain('provider: "manual"');
    expect(route).toContain('checkoutSource: "admin_manual_adjustment"');
    expect(route).toContain("const delta = kopecks - targetUser.balance");
    expect(route).toContain("tx.transaction.create");
  });
});
