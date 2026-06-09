import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

// B358 / Баг 9 — payment-side notifications (card link, subscription, credit
// top-up) must reach email + web + Telegram.
describe("B358 payment notifications", () => {
  const billing = source("src/lib/billing-credit.ts");
  const events = source("src/lib/notification-events.ts");

  it("a settled credit-pack purchase notifies the buyer (BALANCE_TOPUP)", () => {
    expect(billing).toMatch(/kind === "credits"[\s\S]{0,200}event:\s*"BALANCE_TOPUP"/);
  });

  it("card link, subscription and balance top-up default to email", () => {
    const defaults = events.slice(events.indexOf("DEFAULT_EMAIL_EVENTS"));
    expect(defaults).toContain('"CARD_LINKED"');
    expect(defaults).toContain('"SUBSCRIPTION_STARTED"');
    expect(defaults).toContain('"BALANCE_TOPUP"');
  });
});

// B342 / Интерфейс 4-5 and B344 / Интерфейс 15 — form fields share one look.
describe("field styling consistency", () => {
  it("settings timezone select uses the premium-input field family", () => {
    const settings = source("src/app/cabinet/settings/settings-client.tsx");
    expect(settings).toMatch(/<select[\s\S]{0,200}premium-input/);
  });

  it("practitioner bio textarea uses the premium-input field family", () => {
    const editor = source("src/app/cabinet/practitioner/profile/profile-editor.tsx");
    expect(editor).toMatch(/<textarea[\s\S]{0,200}premium-input/);
  });
});
