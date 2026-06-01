import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("T4 admin users — full editable table + channel tracking", () => {
  it("derives the acquisition channel from the persisted provider column and filters by it", () => {
    const page = source("src/app/admin/users/page.tsx");
    const panel = source("src/app/admin/users/users-control-panel.tsx");
    // U1: channel taxonomy extracted to the shared display module.
    const display = source("src/app/admin/users/user-display.ts");

    // Channel taxonomy + DB-backed filter (reuses User.provider; defaults to manual).
    expect(page).toContain("CHANNEL_PROVIDERS");
    expect(page).toContain('where.provider');
    expect(panel).toContain('param="channel"');
    expect(display).toContain("channelOf");
    expect(display).toContain('case "vk": return "vk"');
    expect(display).toContain('default: return "manual"');
  });

  it("exposes money-balance and clarity-credit editing (in the modal) gated by user class", () => {
    // U2: editing moved from inline table cells into the per-user modal.
    const modal = source("src/app/admin/users/user-edit-modal.tsx");

    expect(modal).toContain("canManageBalance");
    expect(modal).toContain('action: "update_balance"');
    expect(modal).toContain('action: "update_clarity_credits"');
    // Clarity credits stay inert for non-clients.
    expect(modal).toContain('row.role !== "CLIENT"');
  });

  it("adds a client-only clarity-credit adjustment action to the user API", () => {
    const route = source("src/app/api/admin/users/[id]/route.ts");

    expect(route).toContain('case "update_clarity_credits"');
    expect(route).toContain("recordClarityCreditEntry");
    expect(route).toContain('targetUser.role !== "CLIENT"');
    expect(route).toContain("update_clarity_credits: \"SUPERADMIN_ONLY\"");
  });
});
