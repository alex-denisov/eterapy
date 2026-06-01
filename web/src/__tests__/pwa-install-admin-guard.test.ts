import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/components/pwa-install-prompt.tsx"),
  "utf8",
);

describe("PWA install prompt — admin guard", () => {
  it("does not intercept beforeinstallprompt in the admin area", () => {
    // The banner (and its preventDefault) must not run on admin host / /admin —
    // it's irrelevant for desktop staff and produced a Chrome console notice.
    expect(source).toContain('host.startsWith("admin.") || path.startsWith("/admin")');
    // the guard returns BEFORE the listener is registered
    const guardIdx = source.indexOf('path.startsWith("/admin")');
    const listenerIdx = source.indexOf('addEventListener("beforeinstallprompt"');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(listenerIdx).toBeGreaterThan(guardIdx);
  });
});
