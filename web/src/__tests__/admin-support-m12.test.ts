import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("M12 — moderator/admin support interface (same as client)", () => {
  it("adds an admin support page reusing the client support components", () => {
    const page = source("src/app/admin/support/page.tsx");
    expect(page).toContain('data-testid="admin-support-page"');
    // reuse the exact client-cabinet support building blocks
    expect(page).toContain("SupportChat");
    expect(page).toContain("ComplaintForm");
    expect(page).toContain("admin-support-telegram");
    expect(page).toContain("admin-support-chat-section");
    // moderators are allowed in
    expect(page).toContain('["ADMIN", "SUPERADMIN", "MODERATOR"]');
  });

  it("links the support page from the admin shell nav", () => {
    const shell = source("src/app/admin/admin-shell.tsx");
    expect(shell).toContain('adminUrl("/admin/support")');
    expect(shell).toContain('label: "Поддержка"');
    expect(shell).toContain("LifeBuoy");
  });
});
