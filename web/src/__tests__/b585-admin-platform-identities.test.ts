/**
 * B585 (владелец 2026-07-26): «в суперадминке в профиле клиента я не вижу чтобы
 * был привязан telegram id, хотя пользователь заходила с телеграм, затем
 * регистрировалась чтобы привязать аккаунт».
 *
 * Привязка была — на проде у этого клиента строка в `platform_identities`
 * (provider=telegram) появилась в ту же секунду, что и сам аккаунт. Не показывал
 * её интерфейс: в карточке было поле «Telegram», но привязано оно к
 * `users.telegramUsername` — ручному адресу для уведомлений, который никто не
 * заполнял. Два разных хранилища, показывалось не то.
 *
 * Тест целится в причину: карточка обязана ЧИТАТЬ `platformIdentities` и
 * показывать их отдельно от поля уведомлений.
 */
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("B585 — привязка Telegram видна в карточке клиента", () => {
  const page = read("src/app/admin/users/admin-users-page.tsx");
  const modal = read("src/app/admin/users/user-edit-modal.tsx");
  const display = read("src/app/admin/users/user-display.ts");

  it("страница запрашивает платформенные личности вместе с пользователем", () => {
    expect(page).toContain("platformIdentities: {");
    expect(page).toContain("subjectId: true");
    expect(page).toContain("lastSeenAt: true");
  });

  it("строка пользователя несёт и подтверждённые привязки, и легаси-id уведомлений", () => {
    expect(display).toContain("platformIdentities: Array<{");
    expect(display).toContain("telegramId: string | null;");
  });

  it("карточка показывает привязки и не путает их с адресом для уведомлений", () => {
    expect(modal).toContain("row.platformIdentities");
    expect(modal).toContain("Привязанные входы");
    // Поле уведомлений остаётся, но больше не называется просто «Telegram» —
    // именно это и вводило в заблуждение.
    expect(modal).toContain("Telegram для уведомлений");
  });

  it("привязки только для чтения — их пишет проверка подписи Telegram, не администратор", () => {
    const block = modal.slice(
      modal.indexOf("user-modal-platform-identities"),
      modal.indexOf("row.role === \"CLIENT\" && (permissions.canViewClientSessions"),
    );
    expect(block).not.toContain("<Input");
    expect(block).not.toContain("onChange");
  });
});
