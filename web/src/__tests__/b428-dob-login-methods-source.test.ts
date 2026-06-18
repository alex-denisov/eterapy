import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B428 DOB source, set password, and social unlink surfaces", () => {
  it("persists DOB source in schema and profile/VK flows", () => {
    expect(source("prisma/schema.prisma")).toContain("birthDateSource");
    expect(source("prisma/migrations/20260618175500_add_dob_source_for_login_methods/migration.sql")).toContain("birth_date_source");

    const profileRoute = source("src/app/api/auth/extended-profile/route.ts");
    expect(profileRoute).toContain("birthDateSource");
    expect(profileRoute).toContain('birthDateSource: utcBirthDate ? "manual" : null');

    expect(source("src/app/api/auth/vk-login/route.ts")).toContain('birthDateSource = "vk"');
    expect(source("src/app/api/auth/vk-exchange/route.ts")).toContain('birthDateSource = "vk"');
  });

  it("records Google as a linked provider and exposes password/social controls in settings", () => {
    expect(source("src/lib/auth.ts")).toContain('provider: "google"');
    expect(source("src/lib/auth.ts")).toContain("providerId: account.providerAccountId");

    const settingsPage = source("src/app/cabinet/settings/page.tsx");
    expect(settingsPage).toContain("linkedLoginProviders");
    expect(settingsPage).toContain("hasPasswordLogin");

    const settingsClient = source("src/app/cabinet/settings/settings-client.tsx");
    expect(settingsClient).toContain("/api/auth/set-password-request");
    expect(settingsClient).toContain("/api/auth/social-link/");
    expect(settingsClient).toContain('data-testid="linked-login-methods"');
    expect(settingsClient).toContain('data-testid="set-password-panel"');
  });

  it("does not include profile DOB in the generic dialogue LLM routes", () => {
    const dialogueApi = [
      source("src/app/api/dialogues/route.ts"),
      source("src/app/api/dialogues/[id]/answer/route.ts"),
    ].join("\n");

    expect(dialogueApi).not.toContain("birthDate");
    expect(dialogueApi).not.toContain("birthTime");
    expect(dialogueApi).not.toContain("birthPlace");
  });
});
