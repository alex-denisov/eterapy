import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("B193 share/referral surfaces", () => {
  it("uses an anonymized Design v4 share card by default", () => {
    const component = source("src/components/ai-share-button.tsx");

    expect(component).toContain('data-testid="safe-share-card"');
    expect(component).toContain("const [hideQuestion, setHideQuestion] = useState(true)");
    expect(component).toContain("без имени, аватарки и исходного вопроса");
    expect(component).toContain('fetch("/api/share"');
    expect(component).toContain("/share?from=");
    expect(component).not.toContain("APP_URL + \"/all-modalities\"");
  });

  it("adds a public share landing that keeps product entry question-first", () => {
    const page = source("src/app/share/page.tsx");
    const attribution = source("src/app/share/share-attribution.tsx");
    const header = source("src/components/header.tsx");
    const footer = source("src/components/footer-conditional.tsx");

    expect(page).toContain('data-testid="public-share-landing"');
    expect(page).toContain("source=share");
    expect(page).toContain("ref=");
    expect(page).toContain("обезличены");
    expect(attribution).toContain('fetch("/api/share/visit"');
    expect(attribution).toContain("share_landing_viewed");
    expect(header).toContain('softPublicHeader');
    expect(footer).toContain('variant="soft"');
    expect(footer).not.toContain("/share");
  });

  it("adds durable referral attribution, anti-fraud and meaningful-action reward rules", () => {
    const schema = source("prisma/schema.prisma");
    const shareApi = source("src/app/api/share/route.ts");
    const visitApi = source("src/app/api/share/visit/route.ts");
    const referral = source("src/lib/share-referral.ts");
    const register = source("src/app/api/auth/register/route.ts");
    const dialogues = source("src/app/api/dialogues/route.ts");

    expect(schema).toContain("model ShareLink");
    expect(schema).toContain("model ReferralAttribution");
    expect(schema).toContain("@@unique([shareLinkId, visitorHash])");
    expect(shareApi).toContain("createSafeShareLink");
    expect(visitApi).toContain("setReferralCookie");
    expect(visitApi).toContain("recordChannelTouch");
    expect(referral).toContain("self_referral");
    expect(referral).toContain("REWARD_PENDING");
    expect(referral).toContain("recordClarityCreditEntry");
    expect(register).toContain("attachReferralToRegisteredUser");
    expect(dialogues).toContain("markReferralMeaningfulAction");
  });

  it("keeps Telegram daily-card sharing pointed at the public question-first flow", () => {
    const dailyCardApi = source("src/app/api/cabinet/daily-card/route.ts");
    const delivery = source("src/lib/notification-delivery.ts");

    expect(dailyCardApi).toContain("shareUrl");
    expect(dailyCardApi).toContain("/share?from=daily-card");
    expect(delivery).toContain("Поделиться бережно");
  });
});
