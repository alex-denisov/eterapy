import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Practitioner verification flow", () => {
  it("lets practitioners submit verification requests into the applications queue", () => {
    const api = source("src/app/api/practitioner/verification/route.ts");
    const dashboard = source("src/app/cabinet/practitioner/page.tsx");
    const card = source("src/app/cabinet/practitioner/verification-request-card.tsx");
    expect(api).toContain("makePractitionerVerificationMarker");
    expect(api).toContain("db.practitionerApplication.create");
    expect(api).toContain("PRACTITIONER_VERIFICATION_REQUEST");
    expect(dashboard).toContain("VerificationRequestCard");
    expect(card).toContain("/api/practitioner/verification");
  });

  it("shows verification requests as a separate application kind and approves verified=true", () => {
    const page = source("src/app/admin/applications/page.tsx");
    const manager = source("src/app/admin/applications/applications-manager.tsx");
    const route = source("src/app/api/admin/applications/[id]/route.ts");
    expect(page).toContain("parsePractitionerVerificationMarker");
    expect(page).toContain('kind: verificationPractitionerId ? "VERIFICATION" : "APPLICATION"');
    expect(manager).toContain("verificationCompleted");
    expect(manager).toContain("Верификация");
    expect(route).toContain("PRACTITIONER_VERIFIED");
    expect(route).toContain("data: { verified: true }");
  });
});
