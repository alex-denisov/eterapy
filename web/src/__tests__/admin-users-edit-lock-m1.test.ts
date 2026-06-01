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

// M1 intent: the users table must never allow accidental in-place edits.
// U1/U2 superseded inline edit-lock with a fully read-only table whose only
// mutating affordance is the "Изменить" button that opens a dedicated modal.
describe("M1/U1 — users table is read-only; edits happen in a modal", () => {
  it("tracks the row being edited and opens the modal for it", () => {
    expect(panel).toContain("const [editing, setEditing] = useState<AdminUserRow | null>(null)");
    expect(panel).toContain("setEditing(row)");
    expect(panel).toContain("UserEditModal");
  });

  it("has no inline editable inputs or per-row save handlers in the table", () => {
    expect(panel).not.toContain("updateDraft");
    expect(panel).not.toContain("function saveRow");
    expect(panel).not.toContain("function enterEdit");
    expect(panel).not.toContain("editingId");
  });

  it("keeps a single pencil (Изменить) affordance per row", () => {
    expect(panel).toContain("Изменить");
    expect(panel).toContain("Pencil");
  });

  it("the modal owns its own Save button and entry/exit", () => {
    expect(modal).toContain("saveAll");
    expect(modal).toContain("Сохранить");
    expect(modal).toContain("onClose");
  });
});
