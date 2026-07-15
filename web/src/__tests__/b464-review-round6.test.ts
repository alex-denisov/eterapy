import fs from "node:fs";
import path from "node:path";
import { REFERRAL_REWARDS } from "@/lib/share-referral";
import { REFERRAL_MONTHLY_CREDIT_LIMIT } from "@/lib/antifraud";

// B464 round-6 — owner PROD re-review 2026-07-04 (6 items). Source assertions
// per project convention: grep the shipped source for load-bearing fragments.

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, "src", rel), "utf8");
}

// ── #1 · settings HUB per the recovered mockup ───────────────────────────────
describe("R20 item 1 — settings is a hub of icon rows", () => {
  it("renders the apricot «О себе» nudge and icon-row sections (not stacked forms)", () => {
    const settings = read("app/cabinet/settings/settings-client.tsx");
    expect(settings).toContain("function SettingsHubRow(");
    expect(settings).toContain('data-testid="settings-about-nudge"');
    expect(settings).toContain('data-testid="settings-about-toggle"');
    expect(settings).toContain("Заполните профиль — результаты станут точнее");
    expect(settings).toContain('<p className="soft-eyebrow mb-2.5 mt-7">разделы</p>');
    // Hub rows carry the section ids + still ship every handler.
    for (const id of ["settings-group-profile", "settings-group-security", "settings-group-notifications", "settings-group-danger"]) {
      expect(settings).toContain(`testId="${id}"`);
    }
    for (const handler of ["handleSaveProfile", "handleSavePassword", "handleUnlinkProvider", "handleDeleteAccount"]) {
      expect(settings).toContain(handler);
    }
    // The old flat grouped-rows scaffolding is gone.
    expect(settings).not.toContain("function SettingsGroup(");
    expect(settings).not.toContain("data-testid=\"settings-anchors\"");
  });
});

// ── #2 · support: first-party escalation channels only (B482 supersedes R21) ─
describe("R21 item 2 + B482 — no bare address or client-facing Telegram support", () => {
  it("drops the bare mailto line from the page", () => {
    const page = read("app/cabinet/support/page.tsx");
    expect(page).not.toContain("Прямой адрес");
  });

  it("keeps the in-cabinet chat and removes Telegram as a client support channel", () => {
    const center = read("components/support/support-help-center.tsx");
    const chat = center.indexOf('data-testid="support-open-chat"');
    expect(chat).toBeGreaterThan(-1);
    expect(center).not.toContain('data-testid="support-telegram"');
    expect(center).not.toContain("Открыть в Telegram");
    expect(center).toContain("{allowsChat && (");
  });
});

// ── #3 · staged support flow holds together (search ↔ category) ──────────────
describe("R21 item 3 — support flow: search and manual category don't collide", () => {
  it("clears the picked category when the user types, and keeps escalation on category", () => {
    const center = read("components/support/support-help-center.tsx");
    // Typing resets category so two lists never stack.
    expect(center).toContain("if (category) {");
    expect(center).toContain("setCategory(null);");
    // Search results hide once a category is chosen.
    expect(center).toContain("{searched && !category && results.length > 0 && (");
    // Category keeps its own block/escalation visible regardless of the query.
    expect(center).toContain("{(searched || category) && (");
    expect(center).toContain("{category && (");
  });
});

// ── #4 · referral backend completed ──────────────────────────────────────────
describe("R22 item 4 — referral backend", () => {
  it("ships the approved staged economics 2/1+2, all confirmed", () => {
    expect(REFERRAL_REWARDS.refereeFirstAnalysis).toBe(2);
    expect(REFERRAL_REWARDS.referrerFirstAnalysis).toBe(1);
    expect(REFERRAL_REWARDS.referrerFirstPurchase).toBe(2);
    const referral = read("lib/share-referral.ts");
    expect(referral).toContain("markReferralFirstPurchase");
    expect(referral).not.toContain('status: "pending"');
  });

  it("stage 2 hooks the single payment-settle point and skips card-binding micro-payments", () => {
    const billing = read("lib/billing-credit.ts");
    expect(billing).toContain("markReferralFirstPurchase");
    expect(billing).toContain('result.entitlementGrant.kind !== "none"');
  });

  it("deviceHash reads the real fingerprint cookie (eterapy_fp)", () => {
    const antifraud = read("lib/antifraud.ts");
    expect(antifraud).toContain("CLIENT_FINGERPRINT_COOKIE");
  });

  it("a duplicate referred user is blocked outright, not just when it exceeds the sum", () => {
    const antifraud = read("lib/antifraud.ts");
    expect(antifraud).toContain('flags.has("duplicate_referred_user_reward")');
  });

  it("enforces the approved 20-credit cap and direct identity/device gates", () => {
    const antifraud = read("lib/antifraud.ts");
    expect(REFERRAL_MONTHLY_CREDIT_LIMIT).toBe(20);
    expect(antifraud).toContain("proposedReferrerRewardCredits");
    expect(antifraud).toContain("pg_advisory_xact_lock");
    expect(antifraud).toContain("referrer_same_device");
    expect(antifraud).toContain("referrer_same_normalized_email");
  });

  it("invite copy states the staged numbers from the contract", () => {
    const invite = read("app/cabinet/invite/page.tsx");
    expect(invite).toContain("REFERRAL_REWARDS.refereeFirstAnalysis");
    expect(invite).toContain("REFERRAL_REWARDS.referrerFirstPurchase");
  });
});

// ── #6 · разбор-list redesign (topic-chip + card rows + icon actions) ─────────
describe("R23 item 6 — «ваши результаты» redesigned per the mockup", () => {
  it("home renders CabinetResultRow instead of flat hairline rows", () => {
    const home = read("app/cabinet/page.tsx");
    expect(home).toContain("CabinetResultRow");
    expect(home).not.toContain('borderTop: i > 0 ? "1px solid var(--soft-paper-edge)" : "none"');
  });

  it("the row has a topic-chip, card-row styling and an icon-action cluster", () => {
    const row = read("components/cabinet/cabinet-result-row.tsx");
    expect(row).toContain("soft-result-chip");
    expect(row).toContain("soft-result-row");
    expect(row).toContain("soft-result-acts");
    expect(row).toContain('data-testid="cabinet-result-hide"');
    const css = read("app/v4-soft.css");
    expect(css).toContain(".soft-result-row {");
    expect(css).toContain(".soft-result-chip {");
    expect(css).toContain(".soft-result-act {");
  });

  it("hide action posts to the reversible diary-visibility endpoint", () => {
    const row = read("components/cabinet/cabinet-result-row.tsx");
    expect(row).toContain("/api/cabinet/diary/visibility");
    const route = read("app/api/cabinet/diary/visibility/route.ts");
    expect(route).toContain("hiddenFromMap");
    expect(route).toContain("mergeDiaryMetadata");
    expect(route).toContain('z.enum(["dialogue", "product"])');
  });
});
