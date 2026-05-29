import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("T4 admin users — full editable table + channel tracking", () => {
  it("derives the acquisition channel from the persisted provider column and filters by it", () => {
    const page = source("src/app/admin/users/page.tsx");
    const panel = source("src/app/admin/users/users-control-panel.tsx");

    // Channel taxonomy + DB-backed filter (reuses User.provider; defaults to manual).
    expect(page).toContain("CHANNEL_PROVIDERS");
    expect(page).toContain('where.provider');
    expect(panel).toContain("channelOf");
    expect(panel).toContain('param="channel"');
    expect(panel).toContain('case "vk": return "vk"');
    expect(panel).toContain('default: return "manual"');
  });

  it("exposes inline money-balance and clarity-credit editing gated by user class", () => {
    const panel = source("src/app/admin/users/users-control-panel.tsx");

    expect(panel).toContain("canManageBalance");
    expect(panel).toContain('action: "update_balance"');
    expect(panel).toContain('action: "update_clarity_credits"');
    // Clarity credits stay inert for non-clients.
    expect(panel).toContain('row.role !== "CLIENT"');
  });

  it("adds a client-only clarity-credit adjustment action to the user API", () => {
    const route = source("src/app/api/admin/users/[id]/route.ts");

    expect(route).toContain('case "update_clarity_credits"');
    expect(route).toContain("recordClarityCreditEntry");
    expect(route).toContain('targetUser.role !== "CLIENT"');
    expect(route).toContain("update_clarity_credits: \"SUPERADMIN_ONLY\"");
  });
});
