import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("V1 — impersonation sets the cookie directly (one less redirect + DB round-trip)", () => {
  const entry = read("src/app/api/admin/impersonate/route.ts");

  it("sets the impersonation cookie and redirects straight to the cabinet", () => {
    expect(entry).toContain("setImpersonationCookie");
    expect(entry).toContain("encodeImpersonationToken");
    expect(entry).toContain("targetRole: target.role");
    expect(entry).toContain("appUrl(cabinet)");
  });

  it("no longer creates a one-time token / second hop", () => {
    expect(entry).not.toContain("telegramLinkToken.create");
    expect(entry).not.toContain("/api/admin/impersonate/${token}");
  });

  it("still guards blocked/deleted/superadmin targets", () => {
    expect(entry).toContain('target.role === "SUPERADMIN"');
    expect(entry).toContain("target.blockedAt || target.deletedAt");
  });
});

describe("V5 — owner financial loop rendered as grouped metric cards", () => {
  const page = read("src/app/admin/page.tsx");

  it("replaces the dense table with grouped metric cards", () => {
    expect(page).toContain('data-testid="admin-owner-finance"');
    expect(page).toContain('title: "Выручка"');
    expect(page).toContain('title: "Выплаты практикам"');
    expect(page).toContain('title: "Возвраты и риски"');
    // Z1-Ф1: the client ₽ balance liability card became a clarity-credits card.
    expect(page).toContain('title: "Кредиты ясности"');
  });
});
