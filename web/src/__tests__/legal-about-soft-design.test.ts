import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

// B431 (M28): the per-document pages were consolidated into one dynamic route +
// a shared Markdown renderer. Design parity now applies to those sources.
const LEGAL_SOURCES = [
  "src/app/legal/[doc]/page.tsx",
  "src/components/legal/legal-markdown.tsx",
];

describe("legal + about pages — Soft Clarity design parity", () => {
  it("renders legal documents inside .legal-prose without the dark prose variant", () => {
    const route = source("src/app/legal/[doc]/page.tsx");
    expect(route).toContain('className="legal-prose"');
    for (const file of LEGAL_SOURCES) {
      expect(source(file)).not.toContain("prose-invert");
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
    for (const file of LEGAL_SOURCES) {
      const content = source(file);
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

  it("defines the legal typography in the Soft Clarity stylesheet", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain(".legal-prose");
    expect(css).toContain(".legal-meta");
  });
});
