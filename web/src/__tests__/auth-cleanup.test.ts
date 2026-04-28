import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function exists(relativePath: string) {
  return fs.existsSync(path.join(root, relativePath));
}

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B055 obsolete auth UI cleanup", () => {
  it("removes old pre-value tool auth gates and local session counter", () => {
    expect(exists("src/components/tool-auth-gate.tsx")).toBe(false);
    expect(exists("src/components/tool-gate.tsx")).toBe(false);
    expect(exists("src/lib/session-counter.ts")).toBe(false);
    expect(exists("src/__tests__/lib/session-counter.test.ts")).toBe(false);
  });

  it("keeps auth modal copy value-first instead of result-gating", () => {
    const modal = source("src/components/auth-modal.tsx");

    expect(modal).toContain("сохранить результат");
    expect(modal).not.toContain("Чтобы получить результат");
    expect(modal).not.toContain("Это займёт 30 секунд");
  });

  it("updates public help registration guidance to value-moment registration", () => {
    const help = source("src/app/help/page.tsx");

    expect(help).toContain("Начните с вопроса и первичного ответа");
    expect(help).not.toContain("доступ ко всем бесплатным сессиям");
  });
});
