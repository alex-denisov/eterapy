import fs from "node:fs";
import path from "node:path";

// B353 / Интерфейс 10 — booking-block scroll containment, compact services,
// visible priority booking.

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "src/app/practitioners/[slug]/page.tsx"), "utf8");

describe("booking sidebar layout", () => {
  it("(5) the sticky booking aside is height-capped + scrollable so tall content stays reachable", () => {
    expect(page).toMatch(/overflow-y-auto/);
    expect(page).toMatch(/maxHeight:\s*"calc\(100vh - 100px\)"/);
  });

  it("(6) the services card uses the compact padding (tighter than the old p-5/12px tiles)", () => {
    expect(page).toMatch(/услуги[\s\S]{0,400}padding:\s*"8px 12px"/);
  });

  it("(2) priority booking is surfaced with a visible hint linking to billing", () => {
    expect(page).toContain('data-testid="priority-booking-hint"');
    expect(page).toContain("Приоритетная запись");
  });
});
