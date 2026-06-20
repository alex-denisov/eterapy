import fs from "node:fs";
import path from "node:path";
import { buildConsentRecords } from "@/lib/legal/consent";
import { legalDocVersionId } from "@/lib/legal/registry";

const source = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("B427 — registration consent records", () => {
  it("builds two separate records (contract + ПДн) with versions, IP and UA", () => {
    const records = buildConsentRecords("user-1", { ipAddress: "1.2.3.4", userAgent: "UA/1" });
    expect(records).toHaveLength(2);

    const contract = records.find((r) => r.checkboxType === "CONTRACT");
    const pdn = records.find((r) => r.checkboxType === "PDN");
    expect(contract).toBeDefined();
    expect(pdn).toBeDefined();

    expect(contract!.ipAddress).toBe("1.2.3.4");
    expect(contract!.userAgent).toBe("UA/1");
    // Contract package vs the separate ПДн consent
    expect(contract!.documentVersions.offer).toBe(legalDocVersionId("offer"));
    expect(contract!.documentVersions.subscriptions).toBe(legalDocVersionId("subscriptions"));
    expect(pdn!.documentVersions.consent).toBe(legalDocVersionId("consent"));
    expect(pdn!.documentVersions.privacy).toBe(legalDocVersionId("privacy"));
    expect(pdn!.consentVersion).toBe(legalDocVersionId("consent"));
  });

  it("defaults missing IP/UA to null", () => {
    const [first] = buildConsentRecords("user-2", {});
    expect(first.ipAddress).toBeNull();
    expect(first.userAgent).toBeNull();
  });
});

describe("B427 — registration enforces exactly two checkboxes", () => {
  const api = source("src/app/api/auth/register/route.ts");
  const page = source("src/app/(auth)/register/page.tsx");

  it("API requires both consent flags and logs consent", () => {
    expect(api).toContain("acceptContract");
    expect(api).toContain("acceptPdn");
    expect(api).toContain("CONSENT_REQUIRED");
    expect(api).toContain("recordRegistrationConsent");
  });

  it("UI shows two non-pre-checked checkboxes and gates submission", () => {
    expect(page).toContain('data-testid="consent-contract"');
    expect(page).toContain('data-testid="consent-pdn"');
    expect(page).not.toContain("defaultChecked");
    expect(page).toContain("consentGiven");
  });
});

describe("B427 — VK onboarding also records consent", () => {
  it("both VK account-creation routes log consent", () => {
    expect(source("src/app/api/auth/vk-exchange/route.ts")).toContain("recordRegistrationConsent");
    expect(source("src/app/api/auth/vk-login/route.ts")).toContain("recordRegistrationConsent");
  });
});
