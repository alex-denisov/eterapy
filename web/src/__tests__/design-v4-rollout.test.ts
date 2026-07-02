import fs from "node:fs";
import path from "node:path";

const srcRoot = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), "utf8");
}

describe("design v4 rollout", () => {
  it("keeps the prototype read-only and copies the visual system into production CSS", () => {
    const layout = source("app/layout.tsx");
    const softCss = source("app/v4-soft.css");

    expect(layout).toContain('import "./v4-soft.css";');
    expect(softCss).toContain("ETerapy Design v4 — Soft Clarity");
    expect(softCss).toContain(".soft-clarity-page");
    expect(softCss).toContain("--soft-paper: #fbf6ee");
    expect(softCss).toContain("--soft-terracotta: #d67558");
    expect(softCss).toContain("--soft-bordeaux: #5c2a2c");
    expect(softCss).not.toContain("@import");
  });

  it("locks the visual regression fixes requested from the v4 prototype audit", () => {
    const layout = source("app/layout.tsx");
    const header = source("components/header.tsx");
    const register = source("app/(auth)/register/page.tsx");
    const vkButton = source("components/vkid-button.tsx");
    const softCss = source("app/v4-soft.css");
    const pricing = source("app/pricing/pricing-plans.tsx");

    expect(layout).toContain('url: "/icon.svg"');
    expect(header).toContain("toCabinetPathname(pathname)");
    expect(header).toContain('isAdminHost = mounted && hostname.startsWith("admin.")');
    // N7: /help is a public page and must show the landing nav, so it is no
    // longer bucketed as an "app area".
    expect(header).toContain('isAppArea = cabinetPathname.startsWith("/cabinet") || isAppHost');
    expect(header).not.toContain('pathname.startsWith("/help") || isAppHost');
    expect(header).toContain("<UserMenu");
    expect(header).toContain("Дневник");
    expect(header).toContain('data-testid="header-dialogue-cta"');
    expect(register).toContain("<VKIDButton");
    expect(vkButton).toContain('fill="currentColor"');
    expect(vkButton).toContain("soft-social-button");
    expect(softCss).toContain(".soft-products-preview");
    expect(softCss).toContain("grid-template-columns: 1fr !important");
    expect(softCss).toContain(".soft-email-banner");
    expect(pricing).not.toMatch(/Скидк[аи][^"]*встреч/i);
    expect(pricing).not.toMatch(/от 299 ₽|от 490 ₽|от 590 ₽|от 790 ₽/);
    expect(pricing).toContain("Встречи со специалистами оплачиваются отдельно по полной цене");
  });
});
