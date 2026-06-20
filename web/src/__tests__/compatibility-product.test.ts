import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B089/B090 compatibility product", () => {
  it("wires the CompatibilityActions component into the «Вместе» surface", () => {
    // «Совместимость» как отдельная услуга снята — движок совместимости теперь
    // живёт сценарием внутри «Вместе» (/products/pair?scenario=compare).
    const page = source("src/app/products/pair/page.tsx");
    const actions = source("src/components/products/compatibility-actions.tsx");

    expect(page).toContain("<CompatibilityActions");
    expect(actions).toContain('data-testid="compatibility-actions"');
    expect(actions).toContain("/api/products/compatibility");
  });

  it("implements invite creation and partner consent flow (B089)", () => {
    const route = source("src/app/api/products/compatibility/route.ts");
    const inviteRoute = source("src/app/api/products/compatibility/invite/[token]/route.ts");
    const partnerRoute = source("src/app/api/products/compatibility/[id]/partner-part/route.ts");
    
    // B089: Creation of invite link
    expect(route).toContain("action: z.literal(\"create_invite\")");
    
    // B089: Partner viewing the invite
    expect(inviteRoute).toContain("inviteToken: token");
    
    // B089: Partner submitting their part and consent
    expect(partnerRoute).toContain("z.literal(true)");
    expect(partnerRoute).toContain("status: \"PARTNER_COMPLETED\"");
  });

  it("ensures privacy boundaries and dual-unlock mechanics (B090)", () => {
    const generateRoute = source("src/app/api/products/compatibility/[id]/generate/route.ts");
    const heuristicLib = source("src/lib/compatibility.ts");
    
    // Generation requires both consents and inputs
    expect(generateRoute).toContain("creatorConsent");
    expect(generateRoute).toContain("partnerConsent");
    expect(generateRoute).toContain("PARTNER_COMPLETED");
    
    // The result model
    expect(heuristicLib).toContain("generateCompatibility");
  });
});
