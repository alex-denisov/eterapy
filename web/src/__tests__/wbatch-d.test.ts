import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("W6 — practitioner subscription: 2 pay buttons + working purchase", () => {
  // B466: покупка тарифа живёт на «Финансы → Тариф» (tariff-plans).
  const client = read("src/app/cabinet/practitioner/finance/tariff-plans.tsx");
  it("offers exactly «С баланса» (with insufficient error) and «Картой»", () => {
    expect(client).toContain("С баланса");
    expect(client).toContain("Картой");
    expect(client).toContain("Недостаточно средств на балансе");
    // the confusing third «Баланс кабинета» button is gone
    expect(client).not.toContain("Баланс кабинета");
    expect(client).not.toContain("startFromCabinetBalance");
  });
  it("the balance route activates the subscription (ACTIVE)", () => {
    const route = read("src/app/api/practitioner/subscriptions/start-from-earnings/route.ts");
    expect(route).toContain('status: "ACTIVE"');
    expect(route).toContain("INSUFFICIENT_EARNINGS");
  });
});

describe("W11 — one canonical content width for every cabinet page", () => {
  it("the shell main constrains + centers every direct child uniformly", () => {
    const css = read("src/app/v4-soft.css");
    expect(css).toContain(".soft-app-main > * {");
    expect(css).toContain("max-width: 64rem !important");
    expect(css).toContain("margin-inline: auto");
  });
});
