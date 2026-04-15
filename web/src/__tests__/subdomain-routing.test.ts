describe("subdomain routing helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("maps each role to same-origin paths by default, even when subdomain env is enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";

    const { homeUrlForRole, homePathForRole } = await import("@/lib/subdomain");

    expect(homePathForRole("CLIENT")).toBe("/cabinet");
    expect(homePathForRole("PRACTITIONER")).toBe("/cabinet/practitioner");
    expect(homePathForRole("ADMIN")).toBe("/admin");
    expect(homePathForRole("SUPERADMIN")).toBe("/admin");

    expect(homeUrlForRole("CLIENT")).toBe("/cabinet");
    expect(homeUrlForRole("PRACTITIONER")).toBe("/cabinet/practitioner");
    expect(homeUrlForRole("ADMIN")).toBe("/admin");
    expect(homeUrlForRole("SUPERADMIN")).toBe("/admin");
  });

  it("keeps auth pages on same-origin paths even when subdomains are enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";

    const { loginUrl, registerUrl, subdomainUrl } = await import("@/lib/subdomain");

    expect(loginUrl()).toBe("/login");
    expect(registerUrl()).toBe("/register");
    expect(subdomainUrl("/help")).toBe("/help");
  });

  it("keeps auth cookies host-scoped by default in primary-domain mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";

    const { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN, authConfig } = await import("@/lib/auth.config");

    expect(SESSION_COOKIE_NAME).toBe("__Secure-authjs.session-token");
    expect(SHARED_COOKIE_DOMAIN).toBeUndefined();
    expect(authConfig.cookies?.sessionToken?.options.domain).toBeUndefined();
  });

  it("can opt into shared subdomain routing explicitly", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";
    process.env.NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY = "false";

    const { homeUrlForRole } = await import("@/lib/subdomain");
    const { SHARED_COOKIE_DOMAIN } = await import("@/lib/auth.config");

    expect(homeUrlForRole("CLIENT")).toBe("https://app.eterapy.com/cabinet");
    expect(homeUrlForRole("ADMIN")).toBe("https://admin.eterapy.com/admin");
    expect(SHARED_COOKIE_DOMAIN).toBe(".eterapy.com");
  });
});
