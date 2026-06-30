import fs from "node:fs";
import path from "node:path";
import { classifyHealthFailureCode } from "@/lib/ai-gateway/credentials";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("A1 — Groq provider-restricted classification", () => {
  it("classifies organization_restricted / suspended as PROVIDER_RESTRICTED", () => {
    expect(
      classifyHealthFailureCode("Organization has been restricted. Please reach out to support.", "X"),
    ).toBe("PROVIDER_RESTRICTED");
    expect(classifyHealthFailureCode("organization_restricted", "X")).toBe("PROVIDER_RESTRICTED");
    expect(classifyHealthFailureCode("Your account is suspended", "X")).toBe("PROVIDER_RESTRICTED");
    // billing still maps separately
    expect(classifyHealthFailureCode("credit balance is too low", "X")).toBe("INSUFFICIENT_CREDITS");
  });

  it("surfaces a clear label + amber tone in the admin UI", () => {
    const center = source("src/app/admin/ai/ai-control-center.tsx");
    expect(center).toContain("PROVIDER_RESTRICTED:");
    expect(center).toContain("аккаунт провайдера ограничен");
    expect(center).toContain('credential.lastErrorCode === "PROVIDER_RESTRICTED"');
  });
});

describe("A1 — effective base URL (CF Gateway) is shown in the API-keys table", () => {
  it("page computes the resolved effective base URL per credential", () => {
    const page = source("src/app/admin/ai/admin-ai-page.tsx");
    expect(page).toContain("resolvedProviderBaseUrl");
    expect(page).toContain("effectiveBaseUrl");
  });

  it("the control center renders the effective base URL + CF Gateway marker", () => {
    const center = source("src/app/admin/ai/ai-control-center.tsx");
    expect(center).toContain("effectiveBaseUrl: string | null");
    expect(center).toContain("эффективный:");
    expect(center).toContain("gateway.ai.cloudflare.com");
  });
});
