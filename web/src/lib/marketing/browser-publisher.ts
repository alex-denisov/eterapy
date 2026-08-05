import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContextOptions, type Locator, type Page } from "playwright-core";
import { marketingPlatformValue, requiredMarketingPlatformValue } from "@/lib/marketing/platform-settings";

// B617: у Дзена нет серверного API публикации — это единственная площадка,
// где браузерная сессия оправдана, и только для СВОИХ публикаций.
type BrowserPlatform = "Dzen";

type BrowserPublication = {
  title: string;
  body: string;
  mediaUrl: string | null;
  engagementTargetUrl?: string | null;
};

export type BrowserPublishedPost = {
  externalPostId: string;
  publicUrl: string;
};

function storageKey(_platform: BrowserPlatform) {
  return "DZEN_BROWSER_STORAGE_STATE" as const;
}

function parseStorageState(raw: string) {
  const value = JSON.parse(raw) as {
    cookies?: unknown;
    origins?: unknown;
  };
  if (!value || !Array.isArray(value.cookies) || !Array.isArray(value.origins)) {
    throw new Error("Browser storageState must be a Playwright JSON object with cookies and origins");
  }
  return value as Exclude<BrowserContextOptions["storageState"], string | undefined>;
}

export async function browserFallbackConfigured(platform: BrowserPlatform) {
  return Boolean(await marketingPlatformValue(storageKey(platform)));
}

async function withAuthenticatedPage<T>(
  platform: BrowserPlatform,
  run: (page: Page) => Promise<T>,
) {
  const rawState = await requiredMarketingPlatformValue(storageKey(platform));
  // B664: chromium снят из релизного образа — он весил четверть образа и
  // обслуживал только этот путь, ни разу не запускавшийся в проде. Путь
  // остаётся рабочим там, где браузер есть (локальный запуск, отдельный образ
  // с `MARKETING_CHROMIUM_EXECUTABLE`), но в проде обязан падать понятной
  // фразой, а не «spawn ENOENT» в глубине playwright.
  const executablePath = process.env.MARKETING_CHROMIUM_EXECUTABLE?.trim() || "/usr/bin/chromium";
  if (!existsSync(executablePath)) {
    throw new Error(
      `Браузерный выпуск недоступен: ${executablePath} нет в этом образе (B664). `
      + "Выпуск в Дзен идёт размеченной лентой; браузерный путь требует отдельного образа "
      + "с chromium и переменной MARKETING_CHROMIUM_EXECUTABLE.",
    );
  }
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    chromiumSandbox: false,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
    timeout: 30_000,
  });
  const context = await browser.newContext({
    storageState: parseStorageState(rawState),
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36 ETerapyPublisher/1.0",
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    return await run(page);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function visible(page: Page, selectors: string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0) > 0 && await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }
  return null;
}

async function assertNoAutomationChallenge(page: Page) {
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 5_000);
  if (/captcha|капч|подтвердите, что вы не робот|security check|challenge/i.test(body)) {
    throw new Error("Browser publication paused: CAPTCHA or security challenge requires a human session refresh");
  }
}

async function downloadMedia(mediaUrl: string | null) {
  if (!mediaUrl) return null;
  if (!/^https:\/\//i.test(mediaUrl)) throw new Error("Browser media URL must use HTTPS");
  const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Browser media download failed: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error("Browser media endpoint did not return an image");
  const directory = await mkdtemp(join(tmpdir(), "eterapy-smm-"));
  const path = join(directory, contentType.includes("jpeg") ? "visual.jpg" : "visual.png");
  await writeFile(path, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
  return { directory, path };
}

export async function publishToDzenBrowser(
  publication: BrowserPublication,
): Promise<BrowserPublishedPost> {
  const channelUrl = await requiredMarketingPlatformValue("DZEN_CHANNEL_URL");
  const media = await downloadMedia(publication.mediaUrl);
  try {
    return await withAuthenticatedPage("Dzen", async (page) => {
      await page.goto("https://dzen.ru/editor", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await assertNoAutomationChallenge(page);
      if (/passport\.yandex|id\.yandex/i.test(page.url())) {
        throw new Error("Dzen browser session expired; refresh DZEN_BROWSER_STORAGE_STATE");
      }

      const create = await visible(page, [
        'button:has-text("Создать публикацию")',
        '[role="button"]:has-text("Создать публикацию")',
        'button:has-text("Создать")',
      ]);
      if (!create) throw new Error("Dzen editor changed: create-publication control was not found");
      await create.click();
      const article = await visible(page, [
        '[role="menuitem"]:has-text("Статья")',
        'button:has-text("Статья")',
        'text="Статья"',
      ]);
      if (article) await article.click();

      const title = await visible(page, [
        'textarea[placeholder*="Заголов"]',
        'input[placeholder*="Заголов"]',
        '[contenteditable="true"][data-placeholder*="Заголов"]',
        '[contenteditable="true"][aria-label*="Заголов"]',
      ]);
      if (!title) throw new Error("Dzen editor changed: title field was not found");
      await title.fill(publication.title);

      const body = await visible(page, [
        '[contenteditable="true"][data-placeholder*="текст"]',
        '[contenteditable="true"][aria-label*="текст"]',
        '.public-DraftEditor-content[contenteditable="true"]',
      ]);
      const genericEditors = page.locator('div[contenteditable="true"]');
      const bodyField = body || (await genericEditors.count().catch(() => 0) > 1 ? genericEditors.last() : null);
      if (!bodyField) throw new Error("Dzen editor changed: article body was not found");
      await bodyField.fill(publication.body);

      if (media) {
        const fileInput = page.locator('input[type="file"][accept*="image"]').first();
        if (await fileInput.count().catch(() => 0) > 0) {
          await fileInput.setInputFiles(media.path);
        }
      }

      const publish = await visible(page, [
        'button:has-text("Опубликовать")',
        '[role="button"]:has-text("Опубликовать")',
      ]);
      if (!publish) throw new Error("Dzen editor changed: publish control was not found");
      await publish.click();
      const confirm = await visible(page, [
        '[role="dialog"] button:has-text("Опубликовать")',
        '[role="dialog"] button:has-text("Подтвердить")',
      ]);
      if (confirm) await confirm.click();
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await assertNoAutomationChallenge(page);
      const publicUrl = page.url();
      if (!/^https:\/\/dzen\.ru\//i.test(publicUrl) || /\/editor(?:\/|$)/i.test(publicUrl)) {
        throw new Error("Dzen did not return a public publication URL after submit");
      }
      const externalPostId = publicUrl.split("/").filter(Boolean).at(-1) || publication.title;
      return { externalPostId, publicUrl: publicUrl || channelUrl };
    });
  } finally {
    if (media) await rm(media.directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
