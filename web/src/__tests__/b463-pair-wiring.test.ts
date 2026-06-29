import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..", "..");
function source(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("B463 — pair hub wiring", () => {
  const page = source("src/app/products/pair/page.tsx");
  const proxy = source("src/proxy.ts");
  const picker = source("src/components/products/pair-scenario-actions.tsx");
  const selfView = source("src/components/products/pair-self-view-intake.tsx");

  it("renders the compact tool-first hero (back-arrow + price), not the tall display headline", () => {
    expect(page).toContain('data-testid="pair-hero-back"');
    expect(page).toContain("<ProductHeroPrice");
    expect(page).not.toContain("soft-display");
    expect(page).not.toContain('data-testid="together-scenarios"');
  });

  it("mounts the inline scenario picker and threads dialogue + relationship type", () => {
    expect(page).toContain("<PairScenarioActions");
    expect(page).toContain("relationshipType={relationshipType}");
    expect(picker).toContain("history.replaceState");
    expect(picker).toContain("<CompatibilityActions");
  });

  it("301/308-redirects the retired /products/compatibility route to the compare scenario", () => {
    expect(proxy).toContain('pathname === "/products/compatibility"');
    expect(proxy).toContain('"/products/pair"');
    expect(proxy).toContain('set("scenario", "compare")');
    expect(proxy).toContain("308");
  });

  it("uses the «Ваша связь» guided self-view (relationship type + warmth/tension) for the pair flow", () => {
    expect(selfView).toContain('data-testid="pair-relationship-picker"');
    expect(selfView).toContain("composePairSelfView");
    expect(selfView).toContain('intakeProductKey: "pair"');
    // the invite carries the chosen relationship type
    expect(source("src/components/products/compatibility-actions.tsx")).toContain(
      "type: relationshipType",
    );
  });

  it("drops anxiety/jargon copy from the hub", () => {
    expect(page).not.toContain("не теряя границ");
    expect(page).not.toContain("инструмент давления");
  });
});
