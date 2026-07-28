import fs from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", relativePath), "utf8");

describe("B614 — borderless interaction states", () => {
  it("neutralizes browser outlines and Tailwind rings globally", () => {
    const tokens = read("app/v5-tokens.css");
    expect(tokens).toContain("--focus-outline: none");
    expect(tokens).toContain("border-color: transparent !important");
    expect(tokens).toContain("box-shadow: none !important");
    expect(tokens).toContain("outline: none !important");
    expect(tokens).toContain("--tw-ring-offset-shadow: 0 0 #0000 !important");
    expect(tokens).toContain("--tw-ring-shadow: 0 0 #0000 !important");
  });

  it("keeps the help search state fill-only", () => {
    const help = read("components/support/support-help-center.tsx");
    expect(help).toContain("focus-within:bg-white");
    expect(help).not.toContain("focus-within:border-");
    expect(help).not.toContain("focus-within:shadow-");
  });

  it("does not reintroduce frames in shared controls", () => {
    for (const file of [
      "components/ui/button.tsx",
      "components/ui/badge.tsx",
      "components/ui/tabs.tsx",
      "components/ui/accordion.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/focus-visible:(?:border|ring)/);
    }
  });

  it("removes mini-app focus and focus-within frames", () => {
    for (const file of [
      "app/miniapp/miniapp.module.css",
      "app/miniapp/miniapp-v21.module.css",
    ]) {
      const css = read(file);
      expect(css).not.toMatch(/:focus[^{]*\{[^}]*outline:\s*[12]px solid/);
      expect(css).not.toMatch(/:focus[^{]*\{[^}]*border-color:\s*rgba\(255,\s*(?:101|128)/);
      expect(css).not.toMatch(/:focus[^{]*\{[^}]*box-shadow:\s*0 0 0 [23]px/);
    }
  });
});
