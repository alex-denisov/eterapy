import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B091/B092 seven-days product", () => {
  it("wires the SevenDaysActions component into the product detail page", () => {
    const page = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/seven-days-actions.tsx");

    expect(page).toContain("<SevenDaysActions");
    expect(actions).toContain('data-testid="seven-days-actions"');
    expect(actions).toContain("/api/products/seven-days");
  });

  it("implements start, pause, resume flow (B091)", () => {
    const route = source("src/app/api/products/seven-days/route.ts");
    const itemRoute = source("src/app/api/products/seven-days/[id]/route.ts");
    
    // B091: Start the route
    expect(route).toContain("action: z.literal(\"start\")");
    
    // B091: Pause / Resume
    expect(itemRoute).toContain("action: z.enum([\"pause\", \"resume\"])");
    expect(itemRoute).toContain("\"PAUSED\" : \"ACTIVE\"");
  });

  it("implements daily completion and final report (B092)", () => {
    const dayRoute = source("src/app/api/products/seven-days/[id]/days/[day]/route.ts");
    
    // B092: Complete a day
    expect(dayRoute).toContain("action: z.literal(\"complete\")");
    expect(dayRoute).toContain("currentDay: route.currentDay + 1");
    
    // B092: Final report generation
    expect(dayRoute).toContain("generateFinalReport");
    expect(dayRoute).toContain("status: \"COMPLETED\"");
  });
});
