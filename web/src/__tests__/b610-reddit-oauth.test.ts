import {
  createRedditOAuthState,
  redditAuthorizationUrl,
  redditRedirectUri,
  verifyRedditOAuthState,
} from "@/lib/marketing/reddit-oauth";

describe("B610 · Reddit OAuth contract", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AUTH_SECRET: "test-oauth-state-signing-secret",
      REDDIT_CLIENT_ID: "reddit-client-id",
      REDDIT_REDIRECT_URI: "https://app.eterapy.com/api/integrations/reddit/callback",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("creates a permanent web authorization request with the required scopes", () => {
    const url = new URL(redditAuthorizationUrl({ state: "signed-state" }));

    expect(url.origin + url.pathname).toBe("https://www.reddit.com/api/v1/authorize");
    expect(url.searchParams.get("client_id")).toBe("reddit-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("redirect_uri")).toBe(redditRedirectUri());
    expect(url.searchParams.get("duration")).toBe("permanent");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(
      ["edit", "history", "identity", "read", "submit"].sort(),
    );
  });

  it("accepts only a non-expired state issued for the current superadmin", () => {
    const now = Date.parse("2026-07-28T12:00:00.000Z");
    const state = createRedditOAuthState("admin-1", now);

    expect(verifyRedditOAuthState(state, "admin-1", now + 60_000)).toBe(true);
    expect(verifyRedditOAuthState(state, "admin-2", now + 60_000)).toBe(false);
    expect(verifyRedditOAuthState(state, "admin-1", now + 11 * 60_000)).toBe(false);
    expect(verifyRedditOAuthState(`${state}tampered`, "admin-1", now + 60_000)).toBe(false);
  });
});
