import fs from "fs";
import path from "path";
import { getProductCreditCost, getProductPriceKopecks } from "@/lib/entitlements";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B201/B202 Circle and Pair flows", () => {
  it("adds durable Circle models with invite, participant, report, and risk fields", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260512212500_add_circle_pair_flows/migration.sql");
    const antiAbuseMigration = source("prisma/migrations/20260513203000_add_social_antiabuse_fields/migration.sql");

    expect(schema).toContain("model ClarityCircle");
    expect(schema).toContain("model ClarityCircleParticipant");
    expect(schema).toContain("inviteExpiresAt DateTime");
    expect(schema).toContain("riskFlags   String[]");
    expect(schema).toContain("creatorDeviceHash");
    expect(schema).toContain("answerHash");
    expect(schema).toContain("reportedReason");
    expect(migration).toContain("CREATE TABLE \"clarity_circles\"");
    expect(migration).toContain("CREATE TABLE \"clarity_circle_participants\"");
    expect(antiAbuseMigration).toContain("creator_device_hash");
    expect(antiAbuseMigration).toContain("answer_hash");
  });

  it("wires Circle public UI to setup, invite, participant, teaser, payment, and map states", () => {
    const page = source("src/app/products/circle/page.tsx");
    const actions = source("src/components/products/circle-actions.tsx");
    const createRoute = source("src/app/api/products/circle/route.ts");
    const participantRoute = source("src/app/api/products/circle/[id]/participant/route.ts");
    const generateRoute = source("src/app/api/products/circle/[id]/generate/route.ts");
    const reportRoute = source("src/app/api/products/circle/[id]/report/route.ts");

    expect(page).toContain("<CircleActions");
    expect(actions).toContain('data-testid="circle-actions"');
    expect(actions).toContain('data-testid="circle-participant-actions"');
    expect(actions).toContain('data-testid="circle-participant-review-list"');
    expect(actions).toContain("<ProductPurchaseControls");
    expect(actions).toContain('productKey="circle"');
    expect(createRoute).toContain("create_circle");
    expect(participantRoute).toContain("Circle is full");
    expect(participantRoute).toContain("assessCircleParticipantRisk");
    expect(participantRoute).toContain("circle_answer_hidden");
    expect(reportRoute).toContain("circle_participant_reported");
    expect(generateRoute).toContain("buildCircleReport");
    expect(generateRoute).toContain("eligibleParticipants");
    expect(generateRoute).toContain("PAYMENT_REQUIRED");
  });

  it("keeps Pair invites on the v4.1 route and uses real dialogue text for generation", () => {
    const pairPage = source("src/app/products/pair/page.tsx");
    const actions = source("src/components/products/compatibility-actions.tsx");
    const createRoute = source("src/app/api/products/compatibility/route.ts");
    const partnerRoute = source("src/app/api/products/compatibility/[id]/partner-part/route.ts");
    const generateRoute = source("src/app/api/products/compatibility/[id]/generate/route.ts");
    const declineRoute = source("src/app/api/products/compatibility/[id]/decline/route.ts");

    expect(pairPage).toContain("<CompatibilityActions");
    // B282: invite URLs now live under /products/{slug} so the partner sees
    // the product-specific context page instead of /pair landing.
    expect(actions).toContain("/products/${productKey === \"pair\" ? \"pair\" : \"compatibility\"}?invite=");
    expect(actions).toContain('data-testid="pair-decline-invite"');
    expect(actions).toContain('data-testid="pair-report-invite"');
    expect(pairPage).toContain('productKey="pair"');
    expect(actions).toContain("productKey={productKey}");
    expect(createRoute).toContain("creatorDialogueId");
    expect(createRoute).toContain("creatorDeviceHash");
    expect(partnerRoute).toContain("partnerDialogueId");
    expect(partnerRoute).toContain("Creator cannot submit partner part");
    expect(partnerRoute).toContain("assessPairPartnerRisk");
    expect(partnerRoute).toContain("pair_partner_review");
    expect(generateRoute).toContain("dialogueToPrivateText");
    expect(generateRoute).toContain("PRODUCT_KEYS");
    expect(generateRoute).toContain('userHasActiveEntitlement(userId, key)');
    expect(generateRoute).toContain("REVIEW_REQUIRED");
    expect(declineRoute).toContain("pair_invite_declined");
    expect(declineRoute).toContain("pair_invite_reported");
    expect(generateRoute).not.toContain("placeholder");
  });

  it("centralizes Circle/Pair anti-abuse checks and review events", () => {
    const antiAbuse = source("src/lib/social-antiabuse.ts");

    expect(antiAbuse).toContain("MIN_CIRCLE_ANSWER_MS");
    expect(antiAbuse).toContain("MIN_PAIR_PARTNER_MS");
    expect(antiAbuse).toContain("pii_detected");
    expect(antiAbuse).toContain("toxicity_detected");
    expect(antiAbuse).toContain("same_device_as_creator");
    expect(antiAbuse).toContain("duplicate_answer_text");
    expect(antiAbuse).toContain("rewardEligible");
  });

  it("prices social products according to the v5 pricing package", () => {
    expect(getProductPriceKopecks("circle")).toBe(79000);
    expect(getProductPriceKopecks("pair")).toBe(79000);
    expect(getProductCreditCost("circle")).toBe(4);
    expect(getProductCreditCost("pair")).toBe(4);
  });
});
