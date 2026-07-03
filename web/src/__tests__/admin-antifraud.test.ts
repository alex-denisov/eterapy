import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B220 admin anti-fraud dashboard", () => {
  it("adds an RBAC-protected admin risk console and navigation entry", () => {
    const shell = source("src/app/admin/admin-shell.tsx");
    const permissions = source("src/lib/moderator-permissions.ts");
    const page = source("src/app/admin/product/quality/page.tsx");

    expect(shell).toContain('/admin/product/quality');
    expect(shell).toContain('label: "Операции и качество"');
    expect(shell).not.toContain('"/admin/antifraud"');
    expect(permissions).toContain('"antifraud.review"');
    expect(page).toContain("canReviewAntifraud");
    expect(page).toContain("getAdminAntifraudData");
  });

  it("covers manual review, appeals, analytics, and evidence sections", () => {
    const helper = source("src/lib/admin-antifraud.ts");
    const route = source("src/app/api/admin/antifraud/route.ts");
    const panel = source("src/app/admin/antifraud/admin-antifraud-panel.tsx");

    expect(helper).toContain("ANTIFRAUD_REVIEW_STATUSES");
    expect(helper).toContain("referralAttribution.count");
    expect(helper).toContain("clarityCreditLedgerEntry.count");
    expect(helper).toContain("practitioner.count");
    expect(helper).toContain("payout.count");
    expect(helper).toContain("review.count");
    expect(route).toContain("MANUAL_REVIEW_RESOLVED");
    expect(route).toContain("APPEAL_SUBMITTED");
    expect(route).toContain("appeal_submitted");
    expect(panel).toContain("Ручная проверка");
    expect(panel).toContain("Апелляции");
    expect(panel).toContain("Карта доказательств");
    expect(panel).toContain("Отметить решенным");
    expect(panel).toContain("AdminCompactDataTable");
  });

  it("keeps the v4.2 antifraud console tied to monetization guardrails", () => {
    const page = source("src/app/admin/product/quality/page.tsx");
    const panel = source("src/app/admin/antifraud/admin-antifraud-panel.tsx");

    expect(page).toContain("Антифрод");
    expect(page).toContain("AdminAntifraudPanel");
    expect(panel).toContain('data-testid="admin-antifraud-guardrails"');
    expect(panel).toContain("значимое действие");
    expect(panel).toContain("контур баллов");
    expect(panel).toContain("доверие к практикам");
  });
});
