/**
 * INC-069 — сырая копия inline-скрипта `miniapp-detect` резалась enforce-CSP на
 * admin/cabinet. Чиним хешем, а не нонсом (почему — в комментарии у константы
 * `MINIAPP_SCRIPT_CSP_HASH`).
 *
 * Главный прогон здесь — СТОРОЖ: он пересчитывает sha256 от самой константы
 * скрипта. Если скрипт поменяют, а хеш забудут, тест падает здесь, а не в
 * консоли на проде через неделю.
 */

import { createHash } from "crypto";

import { MINIAPP_INLINE_SCRIPT } from "@/lib/miniapp";
import { MINIAPP_SCRIPT_CSP_HASH, cspValue } from "@/lib/security-headers";

function sha256Base64(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

/** Только script-src: 'unsafe-inline' в style-src стоит всегда и к делу не относится. */
function scriptSrc(csp: string): string {
  return csp.split("; ").find((directive) => directive.startsWith("script-src ")) ?? "";
}

describe("INC-069 · хеш inline-скрипта mini-app в CSP", () => {
  it("хеш в политике посчитан от ТОГО ЖЕ скрипта, что рендерится", () => {
    expect(MINIAPP_SCRIPT_CSP_HASH).toBe(`'sha256-${sha256Base64(MINIAPP_INLINE_SCRIPT)}'`);
  });

  it("nonce-политика (admin/cabinet) пускает скрипт по хешу", () => {
    const directive = scriptSrc(cspValue({ production: true, nonce: "abc123" }));
    expect(directive).toContain(MINIAPP_SCRIPT_CSP_HASH);
    expect(directive).toContain("'nonce-abc123'");
    expect(directive).not.toContain("'unsafe-inline'");
  });

  it("строгая report-only телеметрия перестаёт считать его нарушением", () => {
    expect(cspValue({ production: true, reportOnly: true })).toContain(MINIAPP_SCRIPT_CSP_HASH);
  });

  it("на публичных страницах ничего не меняется — там 'unsafe-inline'", () => {
    const directive = scriptSrc(cspValue({ production: true }));
    expect(directive).toContain("'unsafe-inline'");
    expect(directive).not.toContain(MINIAPP_SCRIPT_CSP_HASH);
  });
});
