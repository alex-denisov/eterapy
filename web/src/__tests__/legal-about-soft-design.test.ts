import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const LEGAL_PAGES = [
  "src/app/legal/privacy/page.tsx",
  "src/app/legal/cookies/page.tsx",
  "src/app/legal/disclaimer/page.tsx",
  "src/app/legal/ethics/page.tsx",
  "src/app/legal/offer/page.tsx",
];

describe("legal + about pages — Soft Clarity design parity", () => {
  it("drops the dark-theme prose variant on every legal document", () => {
    for (const page of LEGAL_PAGES) {
      const content = source(page);
      expect(content).not.toContain("prose-invert");
      expect(content).toContain('className="legal-prose"');
    }
  });

  it("wraps legal docs in the Soft Clarity shell with a soft-card container", () => {
    const layout = source("src/app/legal/layout.tsx");
    expect(layout).toContain("soft-clarity-page");
    expect(layout).toContain("soft-card");
    expect(layout).toContain("soft-chip");
    // active-tab state via pathname
    expect(layout).toContain("usePathname");
    expect(layout).toContain("soft-chip-warm");
  });

  it("removes generic shadcn tokens from legal docs", () => {
    for (const page of LEGAL_PAGES) {
      const content = source(page);
      expect(content).not.toContain("text-muted-foreground");
      expect(content).not.toContain("bg-card/");
      expect(content).not.toContain("bg-primary/");
      expect(content).not.toContain("text-yellow-4");
    }
  });

  it("rebuilds /about with the Soft Clarity system, not buttonVariants", () => {
    const about = source("src/app/about/page.tsx");
    expect(about).toContain("soft-clarity-page");
    expect(about).toContain("soft-button soft-button-primary");
    expect(about).toContain("var(--soft-bordeaux)");
    expect(about).not.toContain("buttonVariants");
    expect(about).not.toContain("text-muted-foreground");
    // keep the primary CTA target
    expect(about).toContain('href="/checkin"');
  });

  it("defines the legal-prose typography in the Soft Clarity stylesheet", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain(".legal-prose");
    expect(css).toContain(".legal-meta");
  });
});
