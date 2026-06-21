import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B443 recommendations parity (#4 tarot, #11 chat-analysis)", () => {
  const triage = source("src/components/products/service-triage.tsx");
  const tarot = source("src/components/products/symbolic-product-actions.tsx");
  const chat = source("src/components/products/chat-analysis-actions.tsx");

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
});
