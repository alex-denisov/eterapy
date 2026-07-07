import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("M9 — practitioner subscription CTA on «Финансы → Тариф» (B466)", () => {
  it("shows the subscribe CTA on the tariff tab when a higher tier is available", () => {
    const plans = source("src/app/cabinet/practitioner/finance/tariff-plans.tsx");
    expect(plans).toContain('data-testid="practitioner-subscribe-cta"');
    expect(plans).toContain("start-from-earnings");
    const navModel = source("src/lib/nav-model.ts");
    expect(navModel).toContain('appUrl("/practitioner/finance")');
    const page = source("src/app/cabinet/practitioner/page.tsx");
    expect(page).not.toContain('href={appUrl("/billing")}');
  });
});

describe("M10 → B466 — practitioner Настройки with notifications + Telegram", () => {
  it("splits Профиль (public) from Настройки (account) and keeps the notification matrix", () => {
    // B466: owner split — /practitioner/profile = публичный профиль (+
    // Верификация), /practitioner/settings = аккаунт (уведомления/Telegram/
    // пароль/деактивация).
    const profilePage = source("src/app/cabinet/practitioner/profile/page.tsx");
    expect(profilePage).toContain("PractitionerProfileEditor");
    expect(profilePage).toContain("/practitioner/verification");

    const settingsPage = source("src/app/cabinet/practitioner/settings/page.tsx");
    expect(settingsPage).toContain("PractitionerSettingsClient");
    expect(settingsPage).toContain("telegramId");

    const client = source("src/app/cabinet/practitioner/profile/practitioner-settings-client.tsx");
    expect(client).toContain("NotificationSettings");
    expect(client).toContain('role="PRACTITIONER"');
    expect(client).toContain('<h1 className="soft-h1 mt-2 mb-2">Настройки</h1>');
  });
});
