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
    (process.env as Record<string, string>).NODE_ENV = "production";
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
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";

    const { loginUrl, registerUrl, subdomainUrl } = await import("@/lib/subdomain");

    expect(loginUrl()).toBe("/login");
    expect(registerUrl()).toBe("/register");
    expect(subdomainUrl("/help")).toBe("/help");
  });

  it("keeps auth cookies host-scoped by default in primary-domain mode", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";

    const { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN, authConfig } = await import("@/lib/auth.config");

    expect(SESSION_COOKIE_NAME).toBe("__Secure-authjs.session-token");
    expect(SHARED_COOKIE_DOMAIN).toBeUndefined();
    expect(authConfig.cookies?.sessionToken?.options.domain).toBeUndefined();
  });

  it("maps stripped app-subdomain URLs back to cabinet paths for hydration-safe rendering", async () => {
    const { toCabinetPathname } = await import("@/lib/subdomain");

    expect(toCabinetPathname("/billing")).toBe("/cabinet/billing");
    expect(toCabinetPathname("/practitioner/schedule")).toBe("/cabinet/practitioner/schedule");
    expect(toCabinetPathname("/cabinet/billing")).toBe("/cabinet/billing");
    expect(toCabinetPathname("/pricing")).toBe("/pricing");
  });

  it("can opt into shared subdomain routing explicitly", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";
    process.env.NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY = "false";

    const { homeUrlForRole } = await import("@/lib/subdomain");
    const { SHARED_COOKIE_DOMAIN } = await import("@/lib/auth.config");

    expect(homeUrlForRole("CLIENT")).toBe("https://app.eterapy.com/cabinet");
    expect(homeUrlForRole("ADMIN")).toBe("https://admin.eterapy.com/admin");
    expect(SHARED_COOKIE_DOMAIN).toBe(".eterapy.com");
  });

  it("allows staging to use a parent cookie domain with a staging-only cookie name", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";
    process.env.NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY = "false";
    process.env.NEXT_PUBLIC_MAIN_DOMAIN = "staging.eterapy.com";
    process.env.NEXT_PUBLIC_APP_DOMAIN = "staging.app.eterapy.com";
    process.env.NEXT_PUBLIC_ADMIN_DOMAIN = "staging.admin.eterapy.com";
    process.env.AUTH_COOKIE_DOMAIN = ".eterapy.com";
    process.env.AUTH_SESSION_COOKIE_NAME = "__Secure-authjs.staging.session-token";

    const { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN, authConfig } = await import("@/lib/auth.config");

    expect(SESSION_COOKIE_NAME).toBe("__Secure-authjs.staging.session-token");
    expect(SHARED_COOKIE_DOMAIN).toBe(".eterapy.com");
    expect(authConfig.cookies?.sessionToken?.name).toBe("__Secure-authjs.staging.session-token");
    expect(authConfig.cookies?.sessionToken?.options.domain).toBe(".eterapy.com");
  });
});
