import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/checkin",
  "/products",
  "/products/deep-report",
  "/products/chat-analysis",
  "/products/compatibility",
  "/products/seven-days",
  "/pricing",
  "/library",
  "/how-it-works",
  "/practitioners",
  "/practitioners/apply",
  "/share",
  "/login",
  "/register",
];

const viewports = [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 },
];

test.describe("Design v4 Soft Clarity public regression", () => {
  test.setTimeout(60_000);

  for (const viewport of viewports) {
    test.describe(viewport.name, () => {
      test.use({ viewport });

      for (const route of publicRoutes) {
        test(`${route} keeps the v4 shell`, async ({ page }) => {
          const badResponses: string[] = [];
          page.on("response", (response) => {
            const status = response.status();
            const url = response.url();
            const expectedAuthProbe = url.includes("/api/auth/session")
              || (status === 401 && url.includes("/api/products/"));
            if (status >= 400 && !expectedAuthProbe) {
              badResponses.push(`${status} ${response.url()}`);
            }
          });

          await page.goto(route, { waitUntil: "networkidle" });

          expect(await page.locator(".soft-clarity-page").count()).toBeGreaterThan(0);
          await expect(page.locator('[data-testid="public-shell-header"]')).toBeVisible();
          await expect(page.locator('[data-testid="public-shell-footer"]')).toBeVisible();
          await expect(page.locator(".premium-shell")).toHaveCount(0);

          const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflowX).toBeLessThanOrEqual(1);
          expect(badResponses).toEqual([]);

          if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS === "1") {
            await page.screenshot({
              path: test.info().outputPath(`${viewport.name}-${route.replaceAll("/", "_") || "home"}.png`),
            });
          }
        });
      }
    });
  }
});
