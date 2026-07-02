import fs from "node:fs";
import path from "node:path";

const source = (p: string) => fs.readFileSync(path.join(process.cwd(), "src", p), "utf8");

describe("B464 IB5 — Приглашения invite surface", () => {
  const page = source("app/cabinet/invite/page.tsx");
  const card = source("components/cabinet/invite-link-card.tsx");
  const route = source("app/api/referral/link/route.ts");

  it("uses the owner-locked referral copy", () => {
    expect(page).toContain("подарите разбор — получите баллы");
    expect(page).toContain("Подарите кому-то первый разбор — и пополните свой баланс");
    expect(page).toContain("баллы придут вам обоим");
  });

  it("shows the staged counter and the 60-day credits split", () => {
    expect(page).toContain("приглашены");
    expect(page).toContain("попробовали");
    expect(page).toContain("остались");
    expect(page).toContain("getReferralStats");
    expect(page).toContain("getReferralCredits");
    expect(page).toContain("60 дней");
  });

  it("suppresses the surface on crisis (safety > monetization)", () => {
    expect(page).toContain('data-testid="invite-crisis-guard"');
    expect(page).toContain("safetyLevel");
  });

  it("copies the link and shares to Telegram", () => {
    expect(card).toContain("navigator.clipboard.writeText");
    expect(card).toContain("Скопировать приглашение");
    expect(card).toContain("t.me/share/url");
    expect(card).toContain('fetch("/api/referral/link"');
  });

  it("reuses the existing ShareLink infra (economics deferred)", () => {
    expect(route).toContain("createSafeShareLink");
    expect(route).toContain("shareLandingUrl");
    expect(route).toContain("REFERRAL_SOURCE_TYPE");
  });
});
