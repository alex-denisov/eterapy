import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("M9 — practitioner subscription CTA on Сводка", () => {
  it("shows a subscribe CTA when Pro is not connected", () => {
    const page = source("src/app/cabinet/practitioner/page.tsx");
    expect(page).toContain('data-testid="practitioner-subscribe-cta"');
    expect(page).toContain("Подключить Practitioner Pro");
    expect(page).toContain("Управлять подпиской");
    expect(page).toContain('href={appUrl("/practitioner/subscription")}');
    expect(page).not.toContain('href={appUrl("/billing")}');
  });
});

describe("M10 — practitioner profile becomes Настройки with notifications", () => {
  it("renames the nav item and the settings tabs render notifications + Telegram", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain('label: "Настройки"');
    // B347/Интерфейс 14: page is now a thin server wrapper feeding a tabbed client.
    const page = source("src/app/cabinet/practitioner/profile/page.tsx");
    expect(page).toContain("PractitionerSettingsClient");
    expect(page).toContain("telegramId");
    const client = source("src/app/cabinet/practitioner/profile/practitioner-settings-client.tsx");
    expect(client).toContain("NotificationSettings");
    expect(client).toContain('role="PRACTITIONER"');
    expect(client).toContain('<h1 className="soft-h1 mt-2 mb-2">Настройки</h1>');
  });
});
