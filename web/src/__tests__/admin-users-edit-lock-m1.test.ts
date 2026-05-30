import fs from "node:fs";
import path from "node:path";

const panel = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/users/users-control-panel.tsx"),
  "utf8",
);

describe("M1 — users table editing is locked behind a pencil button", () => {
  it("tracks a single editing row and provides enter/cancel helpers", () => {
    expect(panel).toContain("const [editingId, setEditingId] = useState<string | null>(null)");
    expect(panel).toContain("function enterEdit(id: string)");
    expect(panel).toContain("function cancelEdit(id: string)");
    expect(panel).toContain("function resetDraft(id: string)");
    // saving exits edit mode
    expect(panel).toContain("setEditingId(null)");
  });

  it("disables every editable field until the row is in edit mode", () => {
    expect(panel).toContain("const editing = editingId === row.id");
    expect(panel).toContain("disabled={!canEditName || !editing}");
    expect(panel).toContain("disabled={!canManageRole || !editing}");
    expect(panel).toContain('disabled={!permissions.canManageBalance || row.role === "SUPERADMIN" || !editing}');
    expect(panel).toContain('disabled={!permissions.canManageBalance || row.role !== "CLIENT" || !editing}');
    expect(panel).toContain("disabled={!permissions.canManageRoles || !editing}");
  });

  it("shows a pencil (Изменить) when locked and Save/Cancel when editing", () => {
    expect(panel).toContain("Изменить");
    expect(panel).toContain("Сохранить");
    expect(panel).toContain("Отмена");
    expect(panel).toContain("Pencil");
    expect(panel).toContain("onClick={() => enterEdit(row.id)}");
    expect(panel).toContain("onClick={() => cancelEdit(row.id)}");
    // the always-on bare "Save" button is gone
    expect(panel).not.toContain(">\n                        Save\n");
  });
});
