import fs from "fs";
import path from "path";
import { getProductCreditCost, getProductPriceKopecks } from "@/lib/entitlements";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B201/B202 Circle and Pair flows", () => {
  it("adds durable Circle models with invite, participant, report, and risk fields", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260512212500_add_circle_pair_flows/migration.sql");

    expect(schema).toContain("model ClarityCircle");
    expect(schema).toContain("model ClarityCircleParticipant");
    expect(schema).toContain("inviteExpiresAt DateTime");
    expect(schema).toContain("riskFlags   String[]");
    expect(migration).toContain("CREATE TABLE \"clarity_circles\"");
    expect(migration).toContain("CREATE TABLE \"clarity_circle_participants\"");
  });

  it("wires Circle public UI to setup, invite, participant, teaser, payment, and map states", () => {
    const page = source("src/app/circle/page.tsx");
    const actions = source("src/components/products/circle-actions.tsx");
    const createRoute = source("src/app/api/products/circle/route.ts");
    const participantRoute = source("src/app/api/products/circle/[id]/participant/route.ts");
    const generateRoute = source("src/app/api/products/circle/[id]/generate/route.ts");

    expect(page).toContain("<CircleActions");
    expect(actions).toContain('data-testid="circle-actions"');
    expect(actions).toContain('data-testid="circle-participant-actions"');
    expect(actions).toContain("/api/billing/create-payment");
    expect(actions).toContain('productKey: "circle"');
    expect(createRoute).toContain("create_circle");
    expect(participantRoute).toContain("Circle is full");
    expect(generateRoute).toContain("buildCircleReport");
    expect(generateRoute).toContain("PAYMENT_REQUIRED");
  });

  it("keeps Pair invites on the v4.1 route and uses real dialogue text for generation", () => {
    const pairPage = source("src/app/pair/page.tsx");
    const actions = source("src/components/products/compatibility-actions.tsx");
    const createRoute = source("src/app/api/products/compatibility/route.ts");
    const partnerRoute = source("src/app/api/products/compatibility/[id]/partner-part/route.ts");
    const generateRoute = source("src/app/api/products/compatibility/[id]/generate/route.ts");

    expect(pairPage).toContain("<CompatibilityActions");
    expect(actions).toContain("/pair?invite=");
    expect(createRoute).toContain("creatorDialogueId");
    expect(partnerRoute).toContain("partnerDialogueId");
    expect(partnerRoute).toContain("Creator cannot submit partner part");
    expect(generateRoute).toContain("dialogueToPrivateText");
    expect(generateRoute).not.toContain("placeholder");
  });

  it("prices social products according to the v5 pricing package", () => {
    expect(getProductPriceKopecks("circle")).toBe(79000);
    expect(getProductPriceKopecks("pair")).toBe(79000);
    expect(getProductCreditCost("circle")).toBe(3);
    expect(getProductCreditCost("pair")).toBe(3);
  });
});
