import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9 «Ещё» → Настройки (mockup practitioner-more-settings). Мобильный
// pcab-native экран: привязка Telegram + курированная матрица уведомлений
// (событие × Email/Telegram/В приложении) + аккаунт (язык/пароль/выход).
// НЕ обёртка десктопного NotificationSettings — реюз только ДАННЫХ (prefs/
// telegram-link/change-password API).

const PRAC = "src/app/cabinet/practitioner";

describe("R9 «Ещё» → Настройки — mobile pcab screen", () => {
  const editor = () => source(`${PRAC}/settings/settings-mobile.tsx`);

  it("renders a dedicated pcab mobile screen (topbar «Настройки», no save — spacer)", () => {
    const src = editor();
    expect(src).toContain('data-testid="practitioner-settings-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toMatch(/pcab-screen[^"]*md:hidden/);
    expect(src).toContain("pcab-topbar-title");
    expect(src).toContain("Настройки");
    expect(src).toContain("pcab-topbar-spacer");
  });

  it("Telegram card connects/unlinks via the real telegram-link API", () => {
    const src = editor();
    expect(src).toContain("pcab-tgcard");
    expect(src).toContain('data-testid="practitioner-settings-tg-connect"');
    expect(src).toContain('data-testid="practitioner-settings-tg-unlink"');
    expect(src).toContain("/api/notifications/telegram-link");
    expect(src).toContain('method: "POST"');
    expect(src).toContain('method: "DELETE"');
  });

  it("curated matrix maps mockup rows onto real backend events + bulk-toggles per channel", () => {
    const src = editor();
    expect(src).toContain("MATRIX_ROWS");
    expect(src).toContain("BOOKING_REQUESTED");
    expect(src).toContain("PRACTITIONER_DIGEST");
    expect(src).toContain("pcab-cb");
    expect(src).toContain("practitioner-settings-cb-");
    expect(src).toContain('role="checkbox"');
    // Telegram-столбец заблокирован до подключения
    expect(src).toContain('ch === "TELEGRAM" && !tg.linked');
  });

  it("auto-saves toggles to the notifications preferences API (no save button)", () => {
    const src = editor();
    expect(src).toContain("/api/notifications/preferences");
    expect(src).toContain('method: "PUT"');
    expect(src).toContain("void persist(next)");
  });

  it("account list: language (display), inline password change, logout", () => {
    const src = editor();
    expect(src).toContain("Язык интерфейса");
    expect(src).toContain("Русский");
    expect(src).toContain('data-testid="practitioner-settings-password-row"');
    expect(src).toContain("/api/auth/change-password");
    expect(src).toContain('data-testid="practitioner-settings-logout"');
    expect(src).toContain("logoutUrl()");
    expect(src).toContain("ETerapy для практиков · v5.0");
  });
});

describe("R9 «Ещё» → Настройки — page split", () => {
  const page = () => source(`${PRAC}/settings/page.tsx`);

  it("renders the pcab editor on mobile and the previous desktop settings hidden below md", () => {
    const src = page();
    expect(src).toContain("PractitionerSettingsMobile");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-settings-desktop"');
    // один telegramStatus для обоих инстансов
    expect(src).toContain("const telegramStatus");
  });
});
