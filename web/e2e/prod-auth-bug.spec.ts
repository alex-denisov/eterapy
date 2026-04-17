/**
 * RED reproducer: against prod https://eterapy.com/ an authenticated user
 * with a valid JWE session cookie cannot reach /cabinet — the edge proxy
 * splits the cookie on "." and reads an empty second segment (JWE alg=dir
 * has no encrypted key), so role is always null → 307 to /login.
 *
 * Runs a raw HTTP flow (no UI) so it can test prod directly.
 */
import { test, expect, request as pwRequest } from '@playwright/test';

const PROD = 'https://eterapy.com';
const EMAIL = 'client@test.eterapy.com';
const PASSWORD = 'test1234';

test.describe('prod auth flow', () => {
  test('authenticated user can reach /cabinet (not redirected to /login)', async () => {
    const ctx = await pwRequest.newContext({ baseURL: PROD, ignoreHTTPSErrors: true });

    // Get CSRF
    const csrfRes = await ctx.get('/api/auth/csrf');
    expect(csrfRes.ok()).toBeTruthy();
    const { csrfToken } = await csrfRes.json();

    // POST credentials
    const loginRes = await ctx.post('/api/auth/callback/credentials', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': PROD,
        'Referer': `${PROD}/login`,
      },
      form: {
        csrfToken,
        callbackUrl: `${PROD}/cabinet`,
        email: EMAIL,
        password: PASSWORD,
        redirect: 'false',
        json: 'true',
      },
      maxRedirects: 0,
    });
    expect([302, 200]).toContain(loginRes.status());

    // Verify session endpoint returns our user (sanity: login succeeded)
    const sessionRes = await ctx.get('/api/auth/session');
    const session = await sessionRes.json();
    expect(session?.user?.email).toBe(EMAIL);
    expect(session?.user?.role).toBe('CLIENT');

    // Try /cabinet on main domain — should NOT redirect to /login
    const cabinetRes = await ctx.get('/cabinet', { maxRedirects: 0 });
    const location = cabinetRes.headers()['location'] ?? '';
    expect(location).not.toMatch(/\/login/);

    // Try /cabinet on app subdomain — should NOT redirect to main /login
    const appCtx = await pwRequest.newContext({
      baseURL: 'https://app.eterapy.com',
      ignoreHTTPSErrors: true,
      storageState: await ctx.storageState(),
    });
    const appCabinet = await appCtx.get('/cabinet', { maxRedirects: 0 });
    const appLoc = appCabinet.headers()['location'] ?? '';
    expect(appLoc).not.toMatch(/\/login/);
    // Should either render (200) or redirect within cabinet namespace
    if (appCabinet.status() >= 300 && appCabinet.status() < 400) {
      expect(appLoc).toMatch(/\/cabinet/);
    } else {
      expect(appCabinet.status()).toBeLessThan(400);
    }
  });
});
