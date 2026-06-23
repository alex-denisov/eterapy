import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B443 recommendations parity (#4 tarot, #11 chat-analysis)", () => {
  const triage = source("src/components/products/service-triage.tsx");
  const tarot = source("src/components/products/symbolic-product-actions.tsx");
  const chat = source("src/components/products/chat-analysis-actions.tsx");
  const reframe = source("src/components/products/reframe-actions.tsx");
  const deepReport = source("src/components/products/deep-report-actions.tsx");

  it("shared ServiceTriage uses the checkin card design + другие форматы", () => {
    expect(triage).toContain("soft-triage-primary");
    expect(triage).toContain("soft-triage-option");
    expect(triage).toContain("soft-triage-ribbon");
    expect(triage).toContain("другие форматы");
    expect(triage).toContain("человек рядом");
  });

  it("#4 tarot «что дальше» renders through ServiceTriage with secondary products", () => {
    expect(tarot).toContain("<ServiceTriage");
    expect(tarot).toContain('eyebrow="что дальше"');
    expect(tarot).toContain("secondaryProducts");
    const route = source("src/app/api/products/symbolic/[id]/recommendations/route.ts");
    expect(route).toContain("recommendSecondaryProducts");
    expect(route).toContain("secondaryProducts");
  });

  it("#11 chat-analysis replaces «следующий шаг» with the «что вам подойдет» triage", () => {
    expect(chat).toContain("<ServiceTriage");
    expect(chat).toContain('eyebrow="что вам подойдет"');
    expect(chat).toContain("recommendPrimaryProduct");
    expect(chat).toContain("recommendSecondaryProducts");
    // the old bordeaux single-rec card copy is gone
    expect(chat).not.toContain("getNextStepRecommendation");
  });

  it("reframe «что дальше» renders through ServiceTriage like tarot (repeat + chat primaries)", () => {
    expect(reframe).toContain("<ServiceTriage");
    expect(reframe).toContain('eyebrow="что дальше"');
    expect(reframe).toContain("recommendSecondaryProducts");
    expect(reframe).toContain("dialogueTopicFromChip");
    expect(reframe).not.toContain("getNextStepRecommendation");
    expect(reframe).not.toContain("next-step-card");
  });

  it("deep-report «что дальше» renders through ServiceTriage like tarot (repeat + chat primaries)", () => {
    expect(deepReport).toContain("<ServiceTriage");
    expect(deepReport).toContain('eyebrow="что дальше"');
    expect(deepReport).toContain("recommendSecondaryProducts");
    expect(deepReport).toContain("dialogueTopicFromChip");
    expect(deepReport).not.toContain("getNextStepRecommendation");
    expect(deepReport).not.toContain("next-step-card");
  });

  it("shared product-format-recommendations exposes the chip→topic + exclude helpers", () => {
    const lib = source("src/lib/product-format-recommendations.ts");
    expect(lib).toContain("export function dialogueTopicFromChip");
    expect(lib).toContain("export function recommendPrimaryProductExcluding");
  });
});
