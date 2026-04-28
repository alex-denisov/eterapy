import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B051 value-moment registration", () => {
  it("offers save/register only after a check-in result exists", () => {
    const page = source("src/app/all-modalities/checkin/page.tsx");

    expect(page).toContain("saveGuestResultDraft");
    expect(page).toContain("save-result-register");
    expect(page).toContain('href="/register?intent=save-result"');
    expect(page).toContain('href="/login?intent=save-result"');
    expect(page).toContain("Сохранено в кабинете");
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
