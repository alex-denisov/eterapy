import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/components/pwa-install-prompt.tsx"),
  "utf8",
);

describe("PWA install prompt — admin guard", () => {
  it("does not intercept beforeinstallprompt in admin or paid product funnels", () => {
    // The banner (and its preventDefault) must not run on admin host / /admin,
    // and must not cover paid product above-the-fold previews on mobile.
    expect(source).toContain('host.startsWith("admin.") || path.startsWith("/admin") || path.startsWith("/products")');
    // the guard returns BEFORE the listener is registered
    const guardIdx = source.indexOf('path.startsWith("/admin")');
    const productsGuardIdx = source.indexOf('path.startsWith("/products")');
    const listenerIdx = source.indexOf('addEventListener("beforeinstallprompt"');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(productsGuardIdx).toBeGreaterThan(guardIdx);
    expect(listenerIdx).toBeGreaterThan(guardIdx);
    expect(listenerIdx).toBeGreaterThan(productsGuardIdx);
  });
});
