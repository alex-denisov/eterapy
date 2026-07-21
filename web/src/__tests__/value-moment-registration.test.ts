import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B051 value-moment registration", () => {
  it("offers save/register only after a check-in result exists", () => {
    const page = source("src/components/dialogue/checkin-experience.tsx");

    expect(page).toContain("saveGuestResultDraft");
    expect(page).toContain("primaryAnswer");
    // B414: guests save via the full /login page (AuthModal/register-inline retired);
    // authed users see the auto-saved note instead of a button.
    expect(page).toContain("save-result-login");
    expect(page).toContain('href={accountPath("login", "save-result")}');
    // #10: authed users see the shared auto-saved note (same element as tarot).
    expect(page).toContain('testId="result-autosaved-note"');
  });

  it("makes register and login pages explain the save-result intent", () => {
    const register = source("src/app/(auth)/register/page.tsx");
    const login = source("src/app/(auth)/login/page.tsx");

    expect(register).toContain('intent === "save-result"');
    expect(register).toContain("Сохраните уже полученный ответ");
    expect(register).toContain("ответ сохранён");
    expect(login).toContain('intent === "save-result"');
    expect(login).toContain("сохранить полученный ответ");
  });
});
