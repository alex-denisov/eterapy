import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B444 VK login vs register consent split (#13)", () => {
  const exchange = source("src/app/api/auth/vk-exchange/route.ts");
  const register = source("src/app/(auth)/register/page.tsx");
  const login = source("src/app/(auth)/login/page.tsx");

  it("vk-exchange creates a NEW account only with active consent (vk_consent=1)", () => {
    expect(exchange).toContain('request.cookies.get("vk_consent")');
    expect(exchange).toContain("vkConsentGiven");
    // a new VK identity without active consent is bounced to /register
    expect(exchange).toContain("registerUrl()");
    expect(exchange).toContain("?vk=consent");
  });

  it("register flow gates the VK button behind both consent checkboxes and sets vk_consent", () => {
    expect(register).toContain("disabled={!consentGiven}");
    expect(register).toContain("vk_consent=1");
    // and explains the bounce when arriving with ?vk=consent
    expect(register).toContain('searchParams.get("vk") === "consent"');
  });

  it("login VK button does NOT pre-grant consent (so new users must register)", () => {
    // the login page uses a bare VK button (no vk_consent cookie set there)
    expect(login).toContain("<VKIDButton />");
    expect(login).not.toContain("vk_consent=1");
  });
});
