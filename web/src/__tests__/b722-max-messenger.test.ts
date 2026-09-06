import crypto from "node:crypto";
import { getMaxHttpsAgent, RUSSIAN_TRUSTED_ROOT_CA, RUSSIAN_TRUSTED_SUB_CA } from "@/lib/max/certificates";
import { resolveShortMarketingTarget, buildShortMarketingUrl } from "@/lib/marketing/link-presentation";
import { platformPlaybook } from "@/lib/marketing/platform-playbook";

describe("B722 · MAX Messenger and SMM Integration", () => {
  it("bundles Russian Trusted Root and Sub CAs into HTTPS agent", () => {
    const rootCert = new crypto.X509Certificate(RUSSIAN_TRUSTED_ROOT_CA);
    const subCert = new crypto.X509Certificate(RUSSIAN_TRUSTED_SUB_CA);
    expect(rootCert.subject).toContain("Russian Trusted Root CA");
    expect(subCert.subject).toContain("Russian Trusted Sub CA");
    const agent = getMaxHttpsAgent();
    expect(agent).toBeDefined();
    // Reuses the same agent instance
    expect(getMaxHttpsAgent()).toBe(agent);
  });

  it("supports /s/max/... short marketing links with UTM parameters", () => {
    const shortUrl = buildShortMarketingUrl({
      platform: "max",
      pathOrUrl: "/products/tarot",
    });
    expect(shortUrl).toBe("https://eterapy.com/s/max/products/tarot");

    const resolved = resolveShortMarketingTarget({
      platform: "max",
      targetPath: "products/tarot",
    });
    expect(resolved).toBeDefined();
    const url = new URL(resolved!);
    expect(url.pathname).toBe("/products/tarot");
    expect(url.searchParams.get("utm_source")).toBe("max");
    expect(url.searchParams.get("utm_medium")).toBe("social");
  });

  it("has a registered MAX playbook with appropriate contract", () => {
    const playbook = platformPlaybook("max");
    expect(playbook).toBeDefined();
    expect(playbook.contract.inlineLinkMarkup).toBe("html");
    expect(playbook.contract.linksClickable).toBe(true);
    expect(playbook.contract.maxCharacters).toBe(2500);
  });
});

import { marketingConnectorStates } from "@/lib/marketing/discovery";
import { MARKETING_PLATFORM_FIELDS } from "@/lib/marketing/platform-settings";

describe("B722 · MAX Connector and Settings", () => {
  it("exposes MAX in platform settings fields", () => {
    const maxFields = MARKETING_PLATFORM_FIELDS.filter((f) => f.platform === "Max");
    expect(maxFields.length).toBeGreaterThanOrEqual(3);
    const keys = maxFields.map((f) => f.key);
    expect(keys).toContain("MAX_BOT_TOKEN");
    expect(keys).toContain("MAX_BOT_ID");
    expect(keys).toContain("MAX_CHANNEL_ID");
  });

  it("lists Max in marketingConnectorStates", async () => {
    const states = await marketingConnectorStates();
    const maxState = states.find((s) => s.platform === "Max");
    expect(maxState).toBeDefined();
    expect(maxState?.platform).toBe("Max");
    expect(maxState?.note).toContain("MAX Bot API");
  });
});
