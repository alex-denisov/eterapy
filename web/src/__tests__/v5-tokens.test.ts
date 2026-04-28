import fs from "node:fs";
import path from "node:path";

const globalsCss = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const v5TokensCss = fs.readFileSync(path.join(process.cwd(), "src/app/v5-tokens.css"), "utf8");

describe("v5 design tokens", () => {
  it("loads the v5 token layer from global CSS", () => {
    expect(globalsCss).toContain('@import "./v5-tokens.css";');
  });

  it("exposes the FINAL Brandbook palette and Dialogue Halo semantics", () => {
    expect(v5TokensCss).toContain("--brand-midnight-navy: #081223");
    expect(v5TokensCss).toContain("--brand-warm-gold: #d4a15a");
    expect(v5TokensCss).toContain("--brand-soft-gold: #f2c37d");
    expect(v5TokensCss).toContain("--brand-lavender: #8e89d6");
    expect(v5TokensCss).toContain("--dialogue-halo-core: var(--brand-glow-center)");
    expect(v5TokensCss).toContain("--focus-outline: 2px solid var(--focus-ring)");
  });

  it("maps Tailwind theme colors to v5 brand variables", () => {
    expect(globalsCss).toContain("--color-brand-midnight: var(--brand-midnight-navy)");
    expect(globalsCss).toContain("--color-dialogue-halo-core: var(--dialogue-halo-core)");
    expect(globalsCss).toContain("--primary: var(--brand-warm-gold)");
    expect(globalsCss).toContain("--ring: var(--focus-ring)");
  });
});
