const requiredMarketingPlatformValue = jest.fn();
const saveMarketingPlatformConfig = jest.fn();

jest.mock("@/lib/marketing/platform-settings", () => ({
  marketingPlatformValue: jest.fn(),
  requiredMarketingPlatformValue,
  saveMarketingPlatformConfig,
}));

import {
  createMetaOAuthState,
  metaAuthorizationUrl,
  metaOAuthRedirectUri,
  verifyMetaOAuthState,
} from "@/lib/marketing/meta-oauth";

describe("B610 · Meta OAuth setup", () => {
  const previousSecret = process.env.AUTH_SECRET;

  beforeAll(() => {
    process.env.AUTH_SECRET = "test-only-meta-oauth-signing-secret";
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  });

  beforeEach(() => {
    requiredMarketingPlatformValue.mockReset();
    saveMarketingPlatformConfig.mockReset();
  });

  it("binds state to admin, platform and a short expiry", () => {
    const now = Date.parse("2026-07-28T12:00:00.000Z");
    const state = createMetaOAuthState("Threads", "admin-1", now);
    expect(verifyMetaOAuthState(state, "Threads", "admin-1", now + 60_000)).toBe(true);
    expect(verifyMetaOAuthState(state, "Instagram", "admin-1", now + 60_000)).toBe(false);
    expect(verifyMetaOAuthState(state, "Threads", "admin-2", now + 60_000)).toBe(false);
    expect(verifyMetaOAuthState(`${state}x`, "Threads", "admin-1", now + 60_000)).toBe(false);
    expect(verifyMetaOAuthState(state, "Threads", "admin-1", now + 11 * 60_000)).toBe(false);
  });

  it("provides the exact production callbacks and current publish scopes", async () => {
    requiredMarketingPlatformValue.mockResolvedValue("app-id");
    expect(metaOAuthRedirectUri("Threads")).toBe(
      "https://eterapy.com/api/integrations/meta/threads/oauth/callback",
    );
    expect(metaOAuthRedirectUri("Instagram")).toBe(
      "https://eterapy.com/api/integrations/meta/instagram/oauth/callback",
    );

    const threads = new URL(await metaAuthorizationUrl({ platform: "Threads", state: "signed" }));
    // B655: Threads переехал на `threads.com` — старый `threads.net` отвечает
    // 301 (живая проверка 2026-08-04). Ведём на канонический адрес, чтобы на
    // пути авторизации не было лишнего перехода.
    expect(threads.origin).toBe("https://www.threads.com");
    expect(threads.searchParams.get("scope")).toContain("threads_content_publish");

    const instagram = new URL(await metaAuthorizationUrl({ platform: "Instagram", state: "signed" }));
    expect(instagram.origin).toBe("https://www.instagram.com");
    expect(instagram.searchParams.get("scope")).toContain("instagram_business_content_publish");
  });
});
