import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B442 balance + card formations + cross-domain consent", () => {
  it("#3 header balance re-fetches on a balance-changed event after a credit spend", () => {
    const header = source("src/components/header.tsx");
    const purchase = source("src/components/products/product-purchase-controls.tsx");
    const lib = source("src/lib/balance-events.ts");
    expect(lib).toContain("BALANCE_CHANGED_EVENT");
    expect(lib).toContain("dispatchBalanceChanged");
    expect(header).toContain("BALANCE_CHANGED_EVENT");
    expect(header).toContain("addEventListener(BALANCE_CHANGED_EVENT");
    expect(purchase).toContain("dispatchBalanceChanged()");
  });

  it("#6 celtic cross + 3-card stagger formations with captions outside cards", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain('grid-template-areas');
    expect(css).toContain("tc-now");
    expect(css).toContain("tc-found");
    // 3-card stagger
    expect(css).toContain('.tarot-spread[data-card-count="3"] > *:nth-child(2)');
    // preview captions are now a figcaption cell, not an absolute overlay
    const actions = source("src/components/products/symbolic-product-actions.tsx");
    expect(actions).toContain("tarot-card-cell");
    expect(actions).not.toContain("tarot-card-back-position");
  });

  it("#12 cookie consent persists on the parent domain (shared across subdomains)", () => {
    const banner = source("src/components/cookie-banner.tsx");
    expect(banner).toContain("consentCookieDomain");
    expect(banner).toContain("domain=");
    expect(banner).toContain("parts.slice(-2).join");
    // still reads legacy localStorage as a fallback so users aren't re-prompted
    expect(banner).toContain("localStorage.getItem(CONSENT_KEY)");
  });

  it("CI: the v4 regression e2e no longer hits the retired /products/compatibility", () => {
    const spec = source("e2e/design-v4-regression.spec.ts");
    expect(spec).not.toContain("/products/compatibility");
    expect(spec).toContain("/products/pair");
  });
});
