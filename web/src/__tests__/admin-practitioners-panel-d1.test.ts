import fs from "node:fs";
import path from "node:path";

const panel = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/users/users-control-panel.tsx"),
  "utf8",
);
const modal = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/users/user-edit-modal.tsx"),
  "utf8",
);
const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/users/admin-users-page.tsx"),
  "utf8",
);

describe("D1 — practitioners are managed in the unified users registry", () => {
  it("uses unified server pagination and role filtering", () => {
    expect(page).toContain("const PAGE_SIZE = 20");
    expect(panel).toContain('value="PRACTITIONER"');
    expect(panel).toContain("pageCount");
  });

  it("keeps practitioner operations, finance, tax, booking override, and tariffs in the modal", () => {
    expect(modal).toContain("Практик · профиль и тарифы");
    expect(modal).toContain("Статус профиля");
    expect(modal).toContain("Налоговый статус и реквизиты");
    expect(modal).toContain("Ручное включение записи");
    expect(modal).toContain("triggerPractitionerPayout");
    expect(modal).toContain("user-modal-rate-presets");
  });
});
