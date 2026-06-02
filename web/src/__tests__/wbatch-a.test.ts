import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("W1 — admin user modal renders in a body portal (escapes header stacking context)", () => {
  const modal = read("src/app/admin/users/user-edit-modal.tsx");
  it("uses createPortal to document.body", () => {
    expect(modal).toContain('from "react-dom"');
    expect(modal).toContain("createPortal(");
    expect(modal).toContain("document.body");
    expect(modal).toContain("fixed inset-0 z-[100]");
  });
});

describe("W2 — email-verification banner is full-width + sticky at the very top", () => {
  const banner = read("src/components/email-verification-banner.tsx");
  it("pins to the top and drops the constrained max-w-6xl strip", () => {
    expect(banner).toContain("sticky top-0 z-[90]");
    expect(banner).not.toContain("max-w-6xl");
  });
});

describe("W5 — impersonation banner only shows when actually impersonating + cookie cleared on logout", () => {
  it("cabinet layout keys the banner off session.user.impersonatedBy, not raw cookies", () => {
    const layout = read("src/app/cabinet/layout.tsx");
    expect(layout).toContain("const isImpersonating = Boolean(session.user?.impersonatedBy)");
    expect(layout).not.toContain('cookieStore.has("eterapy-imp")');
  });
  it("logout clears the eterapy-imp cookie", () => {
    expect(read("src/app/api/auth/logout/route.ts")).toContain('"eterapy-imp"');
  });
});

describe("W4 — finance metrics rename + balance-paid products counted", () => {
  const page = read("src/app/admin/page.tsx");
  it("renames the block and counts every product transaction by magnitude", () => {
    expect(page).toContain("Финансовые метрики");
    expect(page).not.toContain("Финансовый контур владельца");
    expect(page).toContain('if (metadata.purchaseKind === "product") {');
    expect(page).not.toContain('if (tx.amount > 0 && metadata.purchaseKind === "product")');
  });
});

describe("W7 — booking status pills are readable (dark text on light tint), unified", () => {
  const status = read("src/lib/booking-status.ts");
  it("replaces the low-contrast text-*-400 on bg-*/10 scheme", () => {
    expect(status).toContain("bg-emerald-100 text-emerald-700");
    expect(status).toContain("bg-red-100 text-red-700");
    expect(status).not.toContain("text-green-400");
    expect(status).not.toContain("text-yellow-400");
  });
});
