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

  // B415: the login modal (auth-modal.tsx) was retired platform-wide — every gate
  // now routes to the full /login page. The component must be gone and unreferenced.
  it("retires the login modal in favour of the full /login page", () => {
    expect(exists("src/components/auth-modal.tsx")).toBe(false);

    const chatActions = source("src/components/products/chat-analysis-actions.tsx");
    expect(chatActions).not.toContain("import { AuthModal }");
    expect(chatActions).toContain("loginUrl()");

    const slotPicker = source("src/app/practitioners/[slug]/slot-picker.tsx");
    expect(slotPicker).not.toContain("import { AuthModal }");
    expect(slotPicker).toContain("loginUrl()");
  });

  it("updates public help registration guidance to value-moment registration", () => {
    const help = source("src/app/help/page.tsx");

    expect(help).toContain("Начните с вопроса и первичного ответа");
    expect(help).not.toContain("доступ ко всем бесплатным сессиям");
  });
});
