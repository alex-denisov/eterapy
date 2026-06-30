import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));

describe("U1 — compact read-only users table (colored text, no badges)", () => {
  const panel = read("src/app/admin/users/users-control-panel.tsx");

  it("renders status/channel/role as colored TEXT, not status pills", () => {
    expect(panel).not.toContain("soft-admin-status-pill");
    expect(panel).toContain("roleColor(row.role)");
    expect(panel).toContain("channelColor(row.provider)");
    expect(panel).toContain("status.className");
  });

  it("Z1-Ф1: shows a credits column; the ₽ balance column is removed", () => {
    expect(panel).not.toContain("Баланс, ₽");
    expect(panel).toContain('label="Баллы"');
    // the old combined header must be gone
    expect(panel).not.toContain("Баланс · баллы");
  });

  it("clarifies activity, subscription and antifraud columns", () => {
    expect(panel).toContain('label="Брони"');
    expect(panel).toContain('label="Покупки"');
    expect(panel).toContain('label="Подписка"');
    expect(panel).toContain('label="Антифрод"');
  });

  it("is read-only: editing happens through the modal, not inline inputs", () => {
    expect(panel).toContain("UserEditModal");
    expect(panel).toContain("setEditing(row)");
    // no inline per-row draft editing remains
    expect(panel).not.toContain("updateDraft");
    expect(panel).not.toContain("saveRow");
  });
});

describe("U2/U4/U6 — user edit modal", () => {
  const modal = read("src/app/admin/users/user-edit-modal.tsx");

  it("has its own Save button and password confirm (manual + reset-email)", () => {
    expect(modal).toContain('data-testid="user-edit-modal"');
    expect(modal).toContain("saveAll");
    expect(modal).toContain("passwordConfirm");
    expect(modal).toContain("Пароли не совпадают");
    expect(modal).toContain('action: "set_password"');
    expect(modal).toContain('"reset_password"');
  });

  it("edits name, role and clarity credits (₽ balance editing removed in Z1-Ф1)", () => {
    expect(modal).toContain('action: "update_name"');
    expect(modal).not.toContain('action: "update_balance"');
    expect(modal).toContain('action: "update_clarity_credits"');
    expect(modal).toContain("usersPatch.role");
  });

  it("U4 — embeds the moderator rights matrix and saves via the moderators API", () => {
    expect(modal).toContain("PERMISSION_GROUPS");
    expect(modal).toContain("/api/admin/moderators");
    expect(modal).toContain("canEditRights");
  });

  it("U6/V3 — manages practitioner categories, tags, commission and session tariff presets", () => {
    // W3: the flat specialty toggle is replaced by the shared 3-level picker
    expect(modal).toContain("PractitionerTaxonomyFields");
    // V3: pricing moved to per-duration PriceRate presets (rates API).
    expect(modal).toContain("toggleRate");
    expect(modal).toContain("/rates");
    expect(modal).toContain("commissionPercent");
    expect(modal).toContain("/profile");
  });

  it("does not redirect to the removed /admin/practitioners or /admin/moderators pages", () => {
    expect(modal).not.toContain("/admin/practitioners?email=");
    expect(modal).not.toContain('href="/admin/moderators"');
  });
});

describe("U4 — /admin/moderators page removed (merged into users modal)", () => {
  it("the standalone moderators page no longer exists", () => {
    expect(exists("src/app/admin/moderators/page.tsx")).toBe(false);
    expect(exists("src/app/admin/moderators/moderators-manager.tsx")).toBe(false);
  });

  it("the moderators API is retained for the modal", () => {
    expect(exists("src/app/api/admin/moderators/route.ts")).toBe(true);
  });
});

describe("U6 — practitioner profile API accepts categories/tags/price/duration", () => {
  const api = read("src/app/api/admin/practitioners/[id]/profile/route.ts");

  it("validates and persists the new fields", () => {
    expect(api).toContain("normalizedSpecialties");
    expect(api).toContain("normalizedTags");
    expect(api).toContain("normalizedPrice");
    expect(api).toContain("normalizedDuration");
    expect(api).toContain("updateData.specialties");
    expect(api).toContain("updateData.pricePerSession");
    expect(api).toContain("updateData.sessionDuration");
  });
});

describe("page wiring — extra data flows to the modal", () => {
  const page = read("src/app/admin/users/admin-users-page.tsx");

  it("passes moderator permission keys and practitioner detail fields", () => {
    expect(page).toContain("moderatorPermissions:");
    expect(page).toContain("permissionsByUser");
    expect(page).toContain("specialties: true");
    expect(page).toContain("pricePerSession: true");
    expect(page).toContain("sessionDuration: true");
  });

  it("passes the new permission flags", () => {
    expect(page).toContain("canManageRights:");
    expect(page).toContain("canSetPassword:");
    expect(page).toContain("canManagePractitioners:");
    expect(page).toContain("canSetPractitionerRates:");
    expect(page).toContain("canViewPractitionerFinance:");
    expect(page).toContain("canViewClientSessions:");
    expect(page).toContain("canDelete:");
  });
});
