import fs from "node:fs";
import path from "node:path";

const srcDir = path.join(process.cwd(), "src");
const src = (rel: string) => fs.readFileSync(path.join(srcDir, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(srcDir, rel));

describe("Y6 — role-based client cabinet access control", () => {
  it("exposes a guardClientCabinet helper that routes non-clients away", () => {
    const guard = src("lib/cabinet-access.ts");
    expect(guard).toContain("export function guardClientCabinet");
    expect(guard).toContain('redirect("/cabinet/practitioner")');
    expect(guard).toContain('adminUrl("/admin")');
  });

  it.each([
    "app/cabinet/wallet/page.tsx",
    "app/cabinet/questions/page.tsx",
    "app/cabinet/diary/page.tsx",
    "app/cabinet/diary/page.tsx",
  ])("guards the client-only surface %s", (file) => {
    expect(src(file)).toContain("guardClientCabinet");
  });

  it("B464 IB3: /billing redirects into the client-guarded wallet money hub", () => {
    const billing = src("app/cabinet/billing/page.tsx");
    const wallet = src("app/cabinet/wallet/page.tsx");
    // The separate «Подписка и оплата» page is retired → redirect to /wallet…
    expect(billing).toContain('redirect(appUrl("/wallet"))');
    // …where the server component enforces the client-only guard.
    expect(wallet).toContain("guardClientCabinet");
  });
});

describe("Y7 — dead redirect stubs removed", () => {
  it.each([
    "app/cabinet/products/page.tsx",
    "app/cabinet/tools/page.tsx",
    "app/cabinet/ai-history/page.tsx",
  ])("%s no longer exists", (file) => {
    expect(exists(file)).toBe(false);
  });
});

describe("Y3 — payout details: card / СБП / legal entity", () => {
  it("API validates the ENTITY method (ИНН/БИК/расчётный счёт)", () => {
    const route = src("app/api/practitioner/payout-details/route.ts");
    expect(route).toContain('"ENTITY"');
    expect(route).toContain("Расчётный счёт — 20 цифр");
    expect(route).toContain("БИК банка — 9 цифр");
  });

  it("form offers the payout modes bound to the tax status (B466)", () => {
    // Самозанятый → Карта/СБП; ИП/юр. лицо → расчётный счёт.
    const form = src("app/cabinet/practitioner/finance/requisites/edit/requisites-edit-form.tsx");
    expect(form).toContain("Юр. название / ИП");
    expect(form).toContain("Расчётный счёт");
    expect(form).toContain('"CARD" | "SBP" | "ENTITY"');
  });
});

describe("Y5 — verification: documents + non-empty guard", () => {
  it("API accepts /uploads attachments and allows note-or-files", () => {
    const route = src("app/api/practitioner/verification/route.ts");
    expect(route).toContain("attachments");
    expect(route).toContain('a.startsWith("/uploads/")');
    expect(route).toContain("note.length < 20 && attachments.length === 0");
  });

  it("card uploads documents via /api/files and gates empty submissions", () => {
    const card = src("app/cabinet/practitioner/verification-request-card.tsx");
    expect(card).toContain('fetch("/api/files"');
    expect(card).toContain('"DOCUMENT"');
    expect(card).toContain("Приложить документы");
    expect(card).toContain("note.trim().length >= 20 || attachments.length > 0");
  });

  it("admin applications surface shows uploaded documents", () => {
    expect(src("app/admin/applications/applications-manager.tsx")).toContain("Документы (");
  });
});

describe("Y9 — the session-pricing source reflects the base 60-minute tariff", () => {
  it("queries the minimum enabled 60-minute PriceRate first", () => {
    // B366: the DB floor getter is the single session-pricing source.
    // B396: /pricing no longer consumes it (the «разовые форматы» table was
    // removed), but the helper still lives in the lib and powers other surfaces.
    const server = src("lib/session-pricing-server.ts");
    expect(server).toContain("durationMin: SESSION_BASE_DURATION_MIN");
    expect(src("lib/session-pricing.ts")).toContain("SESSION_BASE_DURATION_MIN = 60");
  });
});
