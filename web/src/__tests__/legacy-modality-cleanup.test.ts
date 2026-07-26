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

  it("keeps the cabinet practice entrypoint on the v5 dialogue path", () => {
    // B306: /cabinet/modalities was renamed to /cabinet/practice for
    // semantic clarity. The old /cabinet/modalities path is now a stub
    // that redirects forward; the real v4.2 Practice screen lives at
    // /cabinet/practice/page.tsx.
    const legacyIndex = source("src/app/cabinet/modalities/page.tsx");
    const practice = source("src/app/cabinet/diary/page.tsx");
    const slugPage = source("src/app/cabinet/modalities/[slug]/page.tsx");

    // B593: /cabinet/practice сам стал переадресацией — двойной прыжок убран,
    // старый URL ведёт сразу на «Дневник».
    expect(legacyIndex).toContain('permanentRedirect("/cabinet/diary")');
    expect(slugPage).toContain('redirect(`/cabinet/modalities/checkin?source=legacy-${slug}-cabinet`)');
    expect(practice).not.toContain("/cabinet/modalities/tarot");
    expect(practice).not.toContain("/cabinet/modalities/horoscope");
    expect(practice).not.toContain("/cabinet/modalities/natal");
    // B373: the retired «Маршрут 7 дней» upsell/link is gone from the practice page.
    expect(practice).not.toContain('mainUrl("/products/seven-days")');
    expect(practice).not.toContain("premium-card");
    expect(practice).not.toContain("premium-chip");
  });

  it("removes obsolete prototype data modules for old standalone tools", () => {
    expect(fs.existsSync(path.join(root, "src/data/tarot-cards.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/data/numerology.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/app/all-modalities/tools-layout-client.tsx"))).toBe(false);
  });
});
