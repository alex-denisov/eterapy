import { expect, test } from "@playwright/test";

// B381 (M26): mini-app layout. In a messenger mini-app the site header/footer
// must disappear (the messenger draws its own native header → no double header).
// We force the shell with the ?miniapp= override so the flow is deterministic
// without a real Telegram client.

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

test.describe("B381 — mini-app lean layout", () => {
  test("normal tab keeps the site header; подвал на десктопе виден", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="public-shell-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="public-shell-footer"]')).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-miniapp", /.+/);
  });

  // B671 (владелец 2026-08-05): на мобильной подвала нет — он сбивал людей с
  // толку. Это НЕ отменяет контракт B381: разница между обычной вкладкой и
  // мини-аппом осталась содержательной и проверяется здесь буквально.
  // Обычная вкладка: подвал в DOM есть, но скрыт правилом CSS.
  // Мини-апп: подвала в DOM нет вовсе — React его не монтирует.
  test("B671 — на мобильной подвал есть в DOM, но скрыт", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="public-shell-header"]')).toBeVisible();
    const footer = page.locator('[data-testid="public-shell-footer"]');
    await expect(footer).toHaveCount(1);
    await expect(footer).toBeHidden();
  });

  test("?miniapp=telegram hides the site header and footer (no double header)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/?miniapp=telegram");
    await page.waitForLoadState("networkidle");

    // Pre-paint inline script tags the document.
    await expect(page.locator("html")).toHaveAttribute("data-miniapp", "telegram");

    // Site chrome is gone (React unmounts it; CSS hides it before that).
    await expect(page.locator('[data-testid="public-shell-header"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="public-shell-footer"]')).toHaveCount(0);

    // Page content still renders.
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("lean layout persists across in-app navigation via sessionStorage", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/?miniapp=telegram");
    await page.waitForLoadState("networkidle");

    // Navigate to a plain URL with no markers — the session-stored platform
    // keeps the lean layout.
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-miniapp", "telegram");
    await expect(page.locator('[data-testid="public-shell-header"]')).toHaveCount(0);
  });
});
