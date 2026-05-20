import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const legacyTools = ["tarot", "guide", "horoscope", "natal", "numerology"] as const;
const legacyPageRedirects = {
  tarot: "/products/tarot",
  guide: "/checkin?source=legacy-guide",
  horoscope: "/checkin?source=legacy-horoscope",
  natal: "/products/natal-chart",
  numerology: "/products/numerology",
} satisfies Record<(typeof legacyTools)[number], string>;

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B084 legacy modality unlock cleanup", () => {
  it.each(legacyTools)("redirects the old %s page into the v5 canonical public route", (tool) => {
    const page = source(`src/app/all-modalities/${tool}/page.tsx`);

    expect(page).toContain(`redirect("${legacyPageRedirects[tool]}")`);
    expect(page).not.toContain('"use client"');
    expect(page).not.toContain("PaywallScreen");
    expect(page).not.toContain("getFullReadingPriceKopecks");
    expect(page).not.toContain("useSession");
  });

  it.each(legacyTools)("turns the old %s API into a non-billing 410 redirect response", (tool) => {
    const route = source(`src/app/api/modalities/${tool}/route.ts`);

    expect(route).toContain("{ status: 410 }");
    expect(route).toContain(`/checkin?source=legacy-${tool}-api`);
    expect(route).not.toContain("checkAndRecordToolSession");
    expect(route).not.toContain("getFullReadingPriceKopecks");
    expect(route).not.toContain("balanceKopecks");
    expect(route).not.toContain("aiComplete");
  });

  it("removes the obsolete balance-paywall helpers for legacy modality tools", () => {
    expect(fs.existsSync(path.join(root, "src/components/paywall-screen.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/lib/tool-limit.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/lib/tool-limit-server.ts"))).toBe(false);
  });

  it("keeps the all-modalities index redirecting to canonical checkin, not to paid-tool pages", () => {
    const page = source("src/app/all-modalities/page.tsx");

    expect(page).toContain('redirect("/checkin")');
    expect(page).not.toContain('href="/all-modalities/tarot"');
    expect(page).not.toContain('href="/all-modalities/horoscope"');
    expect(page).not.toContain('href="/all-modalities/natal"');
    expect(page).not.toContain("balance-paywall");
  });

  it("keeps the cabinet modalities entrypoint on the v5 dialogue path", () => {
    const index = source("src/app/cabinet/modalities/page.tsx");
    const slugPage = source("src/app/cabinet/modalities/[slug]/page.tsx");

    expect(slugPage).toContain('redirect(`/cabinet/modalities/checkin?source=legacy-${slug}-cabinet`)');
    expect(index).not.toContain("/cabinet/modalities/tarot");
    expect(index).not.toContain("/cabinet/modalities/horoscope");
    expect(index).not.toContain("/cabinet/modalities/natal");
    expect(index).toContain('appUrl("/cabinet/modalities/checkin")');
    expect(index).toContain('mainUrl("/products/deep-report")');
    expect(index).not.toContain("premium-card");
    expect(index).not.toContain("premium-chip");
  });

  it("removes obsolete prototype data modules for old standalone tools", () => {
    expect(fs.existsSync(path.join(root, "src/data/tarot-cards.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/data/numerology.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/app/all-modalities/tools-layout-client.tsx"))).toBe(false);
  });
});
