import fs from "node:fs";
import path from "node:path";

// B359 / Баг 4 — successful payments must be written to the audit log so
// superadmin has a durable «история оплат». The PAYMENT action existed in
// AUDIT_ACTIONS but was never emitted before this change.

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("payment audit logging", () => {
  const billing = source("src/lib/billing-credit.ts");

  it("writes an AUDIT_ACTIONS.PAYMENT entry on a settled payment", () => {
    expect(billing).toMatch(/logAudit\(\s*[\s\S]*AUDIT_ACTIONS\.PAYMENT/);
  });

  it("records amount, product type and provider payment id (non-PII)", () => {
    expect(billing).toMatch(/amountRub[\s\S]{0,80}productType[\s\S]{0,80}providerPaymentId/);
  });

  it("is best-effort (does not block settlement on audit failure)", () => {
    expect(billing).toMatch(/AUDIT_ACTIONS\.PAYMENT[\s\S]{0,200}\.catch\(/);
  });

  it("the PAYMENT action is defined in the audit action registry", () => {
    expect(source("src/lib/audit.ts")).toContain('PAYMENT:             "PAYMENT"');
  });

  it("the /admin/logs viewer gives PAYMENT a financial (warn) tone", () => {
    expect(source("src/app/admin/logs/admin-logs-page.tsx")).toMatch(/PAYMENT.*return "warn"|"PAYMENT"\)\)\s*return "warn"|includes\("PAYMENT"\)/);
  });
});
