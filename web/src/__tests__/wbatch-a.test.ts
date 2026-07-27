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

describe("W2/X2 — email-verification banner is full-width and static at the very top", () => {
  const banner = read("src/components/email-verification-banner.tsx");
  it("is a static full-width banner (no sticky), above the header", () => {
    // X2: both top banners are static so the sticky header never slides under them.
    expect(banner).not.toContain("sticky");
    expect(banner).not.toContain("max-w-6xl");
    expect(banner).toContain("soft-email-banner");
  });
});

describe("X2 — impersonation banner is a global component above the header", () => {
  const layout = read("src/app/layout.tsx");
  const cabinetLayout = read("src/app/cabinet/layout.tsx");
  it("renders globally and no longer inside the cabinet layout", () => {
    expect(layout).toContain("<ImpersonationBanner />");
    expect(cabinetLayout).not.toContain("Режим имперсонации");
  });
});

describe("W5 — impersonation banner only shows when actually impersonating + cookie cleared on logout", () => {
  it("плашка рисуется по видимой метке, а НЕ по подписанному куку полномочий", () => {
    // X2 → INC-080: плашка была серверной и звала `auth()`; один такой вызов в
    // корневом дереве держал весь сайт в динамическом рендере. Теперь это
    // клиент, читающий метку `eterapy-imp-on`. Подписанный `eterapy-imp` в
    // браузер не попадает вовсе — он httpOnly, и плашка его не видит.
    const banner = read("src/components/impersonation-banner.tsx");
    expect(banner).toContain("IMPERSONATION_MARKER_COOKIE");
    expect(banner).not.toContain("await auth()");
    expect(banner).not.toContain('document.cookie.includes("eterapy-imp=")');
  });
  it("метка ставится и снимается ВМЕСТЕ с подписанным куком", () => {
    const lib = read("src/lib/impersonation.ts");
    const setBlock = lib.slice(lib.indexOf("export function setImpersonationCookie"));
    expect(setBlock.slice(0, setBlock.indexOf("export function clearImpersonationCookie")))
      .toContain("IMPERSONATION_MARKER_COOKIE");
    expect(setBlock.slice(setBlock.indexOf("export function clearImpersonationCookie")))
      .toContain("IMPERSONATION_MARKER_COOKIE");
  });
  it("logout clears the eterapy-imp cookie", () => {
    const route = read("src/app/api/auth/logout/route.ts");
    expect(route).toContain('"eterapy-imp"');
    expect(route).toContain('"eterapy-imp-on"');
  });
});

describe("W4 — finance metrics rename + balance-paid products counted", () => {
  const page = read("src/app/admin/finance/page.tsx");
  const data = read("src/app/admin/admin-analytics-data.ts");
  it("renames the block and counts every product transaction by magnitude", () => {
    expect(page).toContain("Финансы платформы");
    expect(page).not.toContain("Финансовый контур владельца");
    expect(data).toContain("productUsage");
    expect(data).toContain("paymentMix");
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
