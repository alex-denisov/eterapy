import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..");
const srcRoot = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), "utf8");
}

function doc(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
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
    expect(header).toContain('pathname.startsWith("/cabinet")');
    expect(header).toContain('hostname.startsWith("app.")');
    expect(header).toContain('hostname.startsWith("admin.")');
    expect(header).toContain('data-testid="header-cabinet-cta"');
    expect(register).toContain("<VKIDButton />");
    expect(vkButton).toContain('fill="currentColor"');
    expect(vkButton).toContain("soft-social-button");
    expect(softCss).toContain(".soft-products-preview");
    expect(softCss).toContain("grid-template-columns: 1fr !important");
    expect(softCss).toContain(".soft-email-banner");
    expect(pricing).not.toMatch(/Скидк[аи][^"]*встреч/i);
    expect(pricing).toContain("Встречи со специалистами оплачиваются отдельно по полной цене");
  });

  it("tracks the emergency v4 rollout as the current design priority", () => {
    const blocks = doc("docs/v5-release/02-BLOCKS.md");
    const rollout = doc("docs/v5-release/08-DESIGN-V4-ROLLOUT.md");

    expect(blocks).toContain("M20. Design v4 Emergency Rollout");
    expect(blocks).toContain("| B187 | M20 | high | B176,B181 | Design v4 landing emergency retrofit | [x]");
    expect(blocks).toContain("| B188 | M20 | high | B187,B071 | Design v4 dialogue and primary answer | [x]");
    expect(rollout).toContain("docs/Design/v4");
    expect(rollout).toContain("Production Functionality Without v4 UI Reference");
    expect(rollout).toContain("Admin cabinet");
  });
});
