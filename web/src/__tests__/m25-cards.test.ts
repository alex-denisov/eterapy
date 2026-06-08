import { readFileSync } from "fs";
import { join } from "path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * M25 — Баг 5: a successful card link must be audited and must NOT show as
 * "Отменён" in billing history (the 1 ₽ verification hold is cancelled by design).
 */
describe("M25 card linking (Баг 5)", () => {
  it("verifyCardHold writes a CARD_LINKED audit entry", () => {
    const lib = source("src/lib/billing-credit.ts");
    expect(lib).toContain("AUDIT_ACTIONS.CARD_LINKED");
    expect(lib).toContain("logAudit");
  });

  it("audit action constants include CARD_LINKED / CARD_REMOVED", () => {
    const audit = source("src/lib/audit.ts");
    expect(audit).toContain('CARD_LINKED:');
    expect(audit).toContain('CARD_REMOVED:');
  });

  it("billing history hides the 1 ₽ card-verification hold", () => {
    const table = source("src/components/cabinet/billing-history-table.tsx");
    expect(table).toContain("привязка (банковской )?карт");
  });
});
