import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("v5 public shell", () => {
  it("uses official brand assets instead of the legacy svg logo", () => {
    const header = source("src/components/header.tsx");
    const footer = source("src/components/footer.tsx");

    expect(header).toContain("brandAssets.logos.horizontalDark");
    expect(footer).toContain("brandAssets.logos.horizontalDark");
    expect(header).not.toContain('src="/logo.svg"');
  });

  it("keeps public navigation question-first", () => {
    const header = source("src/components/header.tsx");

    expect(header).toContain('label: "Задать вопрос"');
    expect(header).toContain('href: "/all-modalities/checkin"');
    expect(header.indexOf('label: "Задать вопрос"')).toBeLessThan(header.indexOf('label: "Практики"'));
    expect(header).toContain('data-testid="public-shell-header"');
    expect(source("src/components/footer.tsx")).toContain('data-testid="public-shell-footer"');
  });
});
