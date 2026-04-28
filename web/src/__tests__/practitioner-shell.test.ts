import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.join(process.cwd(), "src/components/cabinet/cabinet-shell.tsx"), "utf8");

describe("v5 practitioner shell", () => {
  it("keeps practitioner navigation explicit and work-focused", () => {
    expect(shell).toContain("PRACTITIONER_NAV");
    expect(shell).toContain('label: "Мой профиль"');
    expect(shell).toContain('label: "Расписание"');
    expect(shell).toContain('label: "Клиенты"');
    expect(shell).toContain('label: "Выплаты"');
  });

  it("exposes role-specific hooks for practitioner walkthroughs", () => {
    expect(shell).toContain("data-shell-role={role}");
    expect(shell).toContain('data-testid="app-shell-user"');
    expect(shell).toContain('role === "PRACTITIONER" ? PRACTITIONER_NAV : CLIENT_NAV');
  });
});
