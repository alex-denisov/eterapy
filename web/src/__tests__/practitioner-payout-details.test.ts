import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("X13/B466 — practitioner payout requisites mechanic", () => {
  it("exposes a payout-details API that upserts PayoutDetails", () => {
    const route = read("src/app/api/practitioner/payout-details/route.ts");
    expect(route).toContain("db.payoutDetails.upsert");
    expect(route).toContain("CARD");
    expect(route).toContain("SBP");
    expect(route).toContain('session.user.role !== "PRACTITIONER"');
  });

  it("gates requisites behind the verified tax status and takes ИНН from the profile (B483)", () => {
    const route = read("src/app/api/practitioner/payout-details/route.ts");
    // ИНН клиентом не передаётся — берётся из подтверждённого статуса.
    expect(route).toContain('gate.taxReviewStatus !== "VERIFIED"');
    expect(route).toContain("const inn = gate.inn");
    expect(route).toContain("Сначала заполните ИНН");
    // Способ выплаты соответствует статусу.
    expect(route).toContain("Для самозанятых доступны карта или СБП");
    expect(route).toContain("Для ИП и юр. лиц выплаты идут на расчётный счёт");
  });

  it("renders the requisites form on the Финансы edit screen — without an ИНН field", () => {
    const page = read("src/app/cabinet/practitioner/finance/requisites/edit/page.tsx");
    expect(page).toContain("RequisitesEditForm");
    expect(page).toContain('redirect(appUrl("/practitioner/finance/tax-status"))');
    const form = read("src/app/cabinet/practitioner/finance/requisites/edit/requisites-edit-form.tsx");
    expect(form).toContain("/api/practitioner/payout-details");
    expect(form).toContain("налоговым статусом");
    // Нет ни поля, ни state для ИНН — он живёт на «Налоговый статус».
    expect(form).not.toMatch(/label[^>]*>[^<]*ИНН/);
    expect(form).not.toContain("setInn");
  });

  it("locks the requisites tab until ИНН is confirmed (mockup -requisites-locked)", () => {
    const tab = read("src/app/cabinet/practitioner/finance/requisites-tab.tsx");
    expect(tab).toContain("Добавление платёжного средства недоступно");
    expect(tab).toContain("Заполнить ИНН");
    expect(tab).toContain("Добавить номер карты (только для самозанятых)");
    expect(tab).toContain("Добавить расчётный счёт (для ИП / юр. лица)");
    // Owner: полный ИНН на «Налоговый статус» — не маскировать.
    expect(tab).toContain("ИНН {data.inn}");
  });
});
