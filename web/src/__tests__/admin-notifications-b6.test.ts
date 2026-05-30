import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("B6 — superadmin notification management on admin/settings", () => {
  it("renders NotificationSettings on the same admin/settings page (no separate route)", () => {
    const client = source("src/app/admin/settings/admin-settings-client.tsx");
    expect(client).toContain("NotificationSettings");
    expect(client).toContain("telegramStatus");
    expect(client).toContain("Мои уведомления");
  });

  it("feeds the admin's telegram link status from the server page", () => {
    const page = source("src/app/admin/settings/page.tsx");
    expect(page).toContain("telegramId");
    expect(page).toContain("telegramStatus={{ linked:");
  });
});
