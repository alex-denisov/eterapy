import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("M9 — practitioner subscription CTA on Сводка", () => {
  it("shows a subscribe CTA when Pro is not connected", () => {
    const page = source("src/app/cabinet/practitioner/page.tsx");
    expect(page).toContain('data-testid="practitioner-subscribe-cta"');
    expect(page).toContain("Подключить Practitioner Pro");
    expect(page).toContain("Управлять подпиской");
  });
});

describe("M10 — practitioner profile becomes Настройки with notifications", () => {
  it("renames the nav item and adds NotificationSettings + Telegram", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain('label: "Настройки"');
    const page = source("src/app/cabinet/practitioner/profile/page.tsx");
    expect(page).toContain("NotificationSettings");
    expect(page).toContain('role="PRACTITIONER"');
    expect(page).toContain("telegramId");
    expect(page).toContain('<h1 className="soft-h1 mt-2 mb-2">Настройки</h1>');
  });
});
