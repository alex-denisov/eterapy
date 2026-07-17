import fs from "node:fs";
import path from "node:path";

function source(rel: string) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

// Owner 2026-07-17: «Антифрод клиентов» on /admin/ops/security must be a
// paginated journal of ALL antifraud events — including blocked registrations,
// which have no user row (the subject email lives only in event metadata).
// The old query (riskScore>=50 AND user-linked AND role=CLIENT) could never
// show a blocked registration, so the table looked permanently empty.
describe("admin antifraud journal", () => {
  const page = source("src/app/admin/ops/security/page.tsx");

  it("lists all fraud events without a score/user-linkage cutoff", () => {
    expect(page).not.toContain("riskScore: { gte: 50 },\n        OR:");
    expect(page).toContain('orderBy: { createdAt: "desc" }');
    expect(page).toContain("metadata: true");
    expect(page).toContain("metadataEmail");
    expect(page).toContain("Регистрация отклонена");
  });

  it("has no date filter — the journal paginates instead", () => {
    expect(page).toContain('{ key: "time", label: "Время", sortable: true, filterKind: "none" }');
    expect(page).toContain("fraudJournalRows");
  });

  it("localizes risk flags", () => {
    expect(page).toContain("machine_generated_name_strong");
    expect(page).toContain("Одноразовый email");
  });

  it("renders the calendar dropdown in a portal so short tables cannot clip it", () => {
    const table = source("src/components/admin/compact-client-table.tsx");
    expect(table).toContain('import { createPortal } from "react-dom"');
    expect(table).toContain("createPortal(");
    expect(table).toContain("getBoundingClientRect");
  });
});
