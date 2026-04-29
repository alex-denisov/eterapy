import fs from "node:fs";
import path from "node:path";
import { buttonVariants as componentButtonVariants } from "@/components/ui/button";
import { buttonVariants as linkButtonVariants } from "@/lib/button-variants";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("v5 UI primitives", () => {
  it("keeps component and link button variants on v5 tokens", () => {
    const componentClass = componentButtonVariants();
    const linkClass = linkButtonVariants();

    expect(componentClass).toContain("rounded-[var(--radius-pill)]");
    expect(componentClass).toContain("bg-[linear-gradient(180deg,var(--brand-soft-gold),var(--brand-warm-gold))]");
    expect(componentClass).toContain("shadow-[var(--shadow-halo-gold)]");
    expect(linkClass).toContain("rounded-[var(--radius-pill)]");
    expect(linkClass).toContain("bg-[linear-gradient(180deg,var(--brand-soft-gold),var(--brand-warm-gold))]");
  });

  it("uses v5 surface, radius, and focus tokens in core primitives", () => {
    expect(source("src/components/ui/input.tsx")).toContain("premium-input");
    expect(source("src/components/ui/card.tsx")).toContain("premium-card");
    expect(source("src/components/ui/dialog.tsx")).toContain("rounded-[var(--radius-sheet)]");
    expect(source("src/components/providers.tsx")).toContain("var(--surface-overlay)");
  });

  it("exposes safety disclaimer and toast helpers", () => {
    expect(source("src/components/ui/disclaimer.tsx")).toContain('data-slot="disclaimer"');
    expect(source("src/components/ui/disclaimer.tsx")).toContain('role={tone === "warning" ? "alert" : "note"}');
    expect(source("src/components/ui/toast.ts")).toContain("export const v5Toast");
    expect(source("src/components/ui/tabs.tsx")).toContain('data-slot="tabs-trigger"');
    expect(source("src/components/ui/tooltip.tsx")).toContain('data-slot="tooltip-content"');
  });
});
