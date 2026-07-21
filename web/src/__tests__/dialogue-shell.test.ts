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

  // Subtask (2026-06-17, owner): the «зашифровано» plate became a quiet shield
  // line (iOS treatment), and the header can be suppressed on the result phase.
  it("supports hiding the header and renders a quiet privacy line", () => {
    const shell = source("src/components/dialogue/dialogue-shell.tsx");

    expect(shell).toContain("hideHeader");
    expect(shell).toContain("{!hideHeader && (");
    expect(shell).not.toContain('<span className="soft-badge">');
  });

  it("wraps the current check-in dialogue flow", () => {
    const checkin = source("src/components/dialogue/checkin-experience.tsx");

    expect(checkin).toContain('from "@/components/dialogue/dialogue-shell"');
    expect(checkin).toContain("<DialogueShell");
    expect(checkin).toContain('data-testid="dialogue-question-step"');
    expect(checkin).toContain('data-testid="dialogue-clarifying-step"');
    expect(checkin).toContain('data-testid="dialogue-processing-step"');
    expect(checkin).toContain('data-testid="dialogue-result-step"');
    expect(checkin).toContain("<Disclaimer");
  });
});
