import { readFileSync } from "fs";
import { join } from "path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * M25 — Интерфейс 1, 2, 13: copy and user-pill icon fixes.
 * Guards against regression of the wording cleanup in the June-2026 issues sprint.
 */
describe("M25 copy fixes", () => {
  it("B343: pricing/compare drops гость, welcome, тизер, по полной ставке", () => {
    const compare = source("src/app/pricing/compare/page.tsx");
    expect(compare).not.toContain("гость");
    expect(compare).not.toContain("welcome");
    expect(compare).not.toContain("тизер");
    expect(compare).not.toContain("по полной ставке");
    expect(compare).toContain("по тарифу специалиста");
    expect(compare).toContain("в подарок");
  });

  it("B343: user-menu avatar fits inside soft-user-pill (smaller than 28px pill)", () => {
    const header = source("src/components/header.tsx");
    // pill is 1.75rem (28px) tall; avatar must be smaller so it does not touch borders
    expect(header).toContain("soft-user-pill");
    expect(header).toMatch(/soft-user-pill[\s\S]{0,160}h-5 w-5/);
  });

  it("B359/Баг 3: impersonate GET endpoint is never reached via a prefetching <Link>", () => {
    // The impersonate route is a GET with side effects (audit + cookie). Using
    // next/link <Link> prefetches it on hover, logging phantom IMPERSONATE events.
    const modal = source("src/app/admin/users/user-edit-modal.tsx");
    // The state-changing impersonation action must never be reachable through a
    // prefetching Link or GET anchor. A same-origin POST form runs only on click.
    expect(modal).not.toMatch(/<Link[^>]*\/api\/admin\/impersonate/);
    expect(modal).not.toMatch(/<a[^>]*\/api\/admin\/impersonate/);
    expect(modal).toContain('<form action="/api/admin/impersonate" method="post"');
  });

  it("B344: practitioner invite drops English/technical jargon", () => {
    const page = source("src/app/cabinet/practitioner/invite/page.tsx");
    const panel = source("src/app/cabinet/practitioner/invite/invite-panel.tsx");
    // UI display strings must be human Russian, not BYOC/founding/AI-крючок
    expect(page).not.toContain(">BYOC<");
    expect(page).not.toContain("BYOC-ставка");
    expect(page).not.toContain("Ставка founding");
    expect(panel).not.toContain("AI-крючок");
    expect(panel).not.toContain("BYOC-воронку");
    // B466 R9-5 desktop invite-v2: комиссия/ставки живут в «Финансы → Тариф»;
    // экран приглашений — про личные ссылки и статистику, без ставок.
    expect(page).toContain("Приглашения");
    expect(page).toContain("личной ссылке");
    expect(panel).toContain("Текст-приглашение");
  });
});
