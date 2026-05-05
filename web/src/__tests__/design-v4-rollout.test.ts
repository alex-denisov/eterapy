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
    const globals = source("app/globals.css");
    const softCss = source("app/v4-soft.css");

    expect(globals).toContain('@import "./v4-soft.css";');
    expect(softCss).toContain("ETerapy Design v4 — Soft Clarity");
    expect(softCss).toContain(".soft-clarity-page");
    expect(softCss).toContain("--soft-paper: #fbf6ee");
    expect(softCss).toContain("--soft-terracotta: #d67558");
    expect(softCss).toContain("--soft-bordeaux: #5c2a2c");
    expect(softCss).not.toContain("@import");
  });

  it("tracks the emergency v4 rollout as the current design priority", () => {
    const blocks = doc("docs/v5-release/02-BLOCKS.md");
    const rollout = doc("docs/v5-release/08-DESIGN-V4-ROLLOUT.md");

    expect(blocks).toContain("M20. Design v4 Emergency Rollout");
    expect(blocks).toContain("| B187 | M20 | high | B176,B181 | Design v4 landing emergency retrofit | [~]");
    expect(rollout).toContain("docs/Design/v4");
    expect(rollout).toContain("Production Functionality Without v4 UI Reference");
    expect(rollout).toContain("Admin cabinet");
  });
});
