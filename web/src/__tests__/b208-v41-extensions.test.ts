import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B208 auth/checkout/support/admin v4.1 extensions", () => {
  it("moves login and register to the extras.jsx split auth pattern", () => {
    const login = source("src/app/(auth)/login/page.tsx");
    const register = source("src/app/(auth)/register/page.tsx");

    expect(login).toContain('data-testid="auth-v41-login"');
    expect(login).toContain("С возвращением.");
    expect(login).toContain("Ваша карта");
    expect(login).toContain("Войти через Telegram");
    expect(login).toContain("Запомнить устройство");
    expect(register).toContain('data-testid="auth-v41-register"');
    expect(register).toContain("личное пространство для своих вопросов");
    expect(register).toContain("не заменяет психолога или врача");
    expect(register).toContain("Без рекламы и продажи данных");
  });

  it("keeps checkout/billing payment controls on a v4.1 secure-pay surface", () => {
    const billing = source("src/app/cabinet/billing/page.tsx");

    // T21: the dead "1. Проверка / 2. Оплата / 3. Готово" stepper chips were removed.
    expect(billing).not.toContain("1. Проверка");
    expect(billing).toContain("Платёж защищён");
    // Баг 8: subscriptions are paid one-tap via the saved card, with the fresh
    // YooKassa checkout (create-payment) as the no-card fallback.
    expect(billing).toContain("/api/billing/create-payment");
    expect(billing).toContain("/api/billing/pay-with-saved-card");
  });

  it("surfaces complaint/support and safety interrupt extensions without paid CTAs", () => {
    const complaintModal = source("src/components/complaint-modal.tsx");
    const checkin = source("src/app/checkin/page.tsx");

    expect(complaintModal).toContain('data-testid="support-complaint-flow"');
    expect(complaintModal).toContain("эскалация");
    expect(complaintModal).toContain("support@eterapy.com");
    expect(complaintModal).toContain("/api/complaints");
    expect(checkin).toContain('data-testid="dialogue-safety-support-actions"');
    expect(checkin).toContain("112");
    expect(checkin).toContain("ETerapy не будет предлагать платные продукты");
  });

  it("adds admin overview urgency widgets while preserving RBAC admin shell", () => {
    const adminPage = source("src/app/admin/page.tsx");
    const adminShell = source("src/app/admin/admin-shell.tsx");

    expect(adminShell).toContain('data-testid="admin-shell"');
    expect(adminPage).toContain('data-testid="admin-v41-overview"');
    expect(adminPage).toContain('data-testid="admin-urgent-tasks"');
    expect(adminPage).toContain("db.complaint.count");
    expect(adminPage).toContain("db.payout.count");
    expect(adminPage).toContain("db.videoSession.count");
    expect(adminPage).toContain("кризисные и комплаенс-сигналы");
  });
});
