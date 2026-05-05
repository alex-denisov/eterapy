import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Design v4 regression contract", () => {
  it("keeps a durable route coverage matrix for the emergency rollout", () => {
    const regression = read("docs/v5-release/09-DESIGN-V4-REGRESSION.md");

    for (const route of [
      "/",
      "/all-modalities/checkin",
      "/products",
      "/products/deep-report",
      "/products/chat-analysis",
      "/products/compatibility",
      "/products/seven-days",
      "/pricing",
      "/library",
      "/how-it-works",
      "/practitioners",
      "/practitioners/apply",
      "/share",
      "/cabinet",
      "/cabinet/practitioner",
      "/admin",
    ]) {
      expect(regression).toContain(route);
    }

    expect(regression).toContain("Functionality Without Direct Prototype Screen");
    expect(regression).toContain("Known Non-Visual Product Gaps");
    expect(regression).toContain("soft-admin-shell");
    expect(regression).toContain("soft-app-shell");
  });

  it("tracks legacy visual leftovers instead of silently leaving old preview routes", () => {
    expect(fs.existsSync(path.join(repoRoot, "web/src/app/halo-preview"))).toBe(false);

    const regression = read("docs/v5-release/09-DESIGN-V4-REGRESSION.md");
    expect(regression).toContain("premium-card");
    expect(regression).toContain("compatibility CSS remains intentionally tracked");
  });

  it("keeps emergency support wording in Russian-facing docs", () => {
    const uxSpec = read("docs/v5-release/spec/04_UI_UX_Mechanics_and_DoD.md");
    const safetySpec = read("docs/v5-release/spec/08_Content_Copy_Legal_Safety.md");

    expect(`${uxSpec}\n${safetySpec}`).toContain("Экстренная поддержка");
    expect(`${uxSpec}\n${safetySpec}`).not.toContain("Safety interrupt");
  });
});
