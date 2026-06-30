import fs from "node:fs";
import path from "node:path";

const panel = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/users/users-control-panel.tsx"),
  "utf8",
);
const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/users/admin-users-page.tsx"),
  "utf8",
);
const modal = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/users/user-edit-modal.tsx"),
  "utf8",
);

describe("D1 — clients are managed in the unified users registry", () => {
  it("uses 20-per-page server pagination over the unified user table", () => {
    expect(page).toContain("const PAGE_SIZE = 20");
    expect(panel).toContain("pageCount");
    expect(panel).toContain("rows.map((row)");
  });

  it("keeps client profile, sessions, and audit events inside the modal", () => {
    expect(modal).toContain("Профиль клиента");
    expect(modal).toContain("loadClientSessions");
    expect(modal).toContain("loadClientEvents");
    expect(modal).toContain("/api/bookings?role=admin&userId=");
    expect(modal).toContain("/api/admin/audit?targetId=");
  });
});
