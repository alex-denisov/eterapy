import fs from "fs";
import path from "path";

const root = process.cwd();

// The B368 clarity-word restriction was retired by the owner on 2026-07-15.
// The accepted question-first hero contract remains independently load-bearing.
describe("B368 (M26) — landing hero contract", () => {
  it("hero лендинга — «Разберитесь в ситуации за несколько минут»", () => {
    const hero = fs.readFileSync(path.join(root, "src/components/landing/hero.tsx"), "utf8");
    expect(hero).toContain("Разберитесь в ситуации");
    expect(hero).toContain("за несколько минут");
  });
});
