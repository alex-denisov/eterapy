import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("v5 dialogue shell", () => {
  it("exposes a focused shell with progress and halo styling", () => {
    const shell = source("src/components/dialogue/dialogue-shell.tsx");

    expect(shell).toContain('data-testid="dialogue-shell"');
    expect(shell).toContain("--dialogue-halo-core");
    expect(shell).toContain("progress.current");
    expect(shell).toContain("aria-label={`Шаг ${progress.current} из ${progress.total}`}");
  });

  it("wraps the current check-in dialogue flow", () => {
    const checkin = source("src/app/all-modalities/checkin/page.tsx");

    expect(checkin).toContain('from "@/components/dialogue/dialogue-shell"');
    expect(checkin).toContain("<DialogueShell");
    expect(checkin).toContain("progress={!result ? { current: step + 1, total: questions.length } : undefined}");
    expect(checkin).toContain("<Disclaimer");
  });
});
