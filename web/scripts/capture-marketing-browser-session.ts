import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { chromium } from "@playwright/test";

const platform = process.argv[2]?.trim().toLowerCase();
if (platform !== "dzen" && platform !== "reddit") {
  throw new Error("Usage: npm run marketing:capture-session -- dzen|reddit");
}

const startUrl = platform === "dzen"
  ? "https://dzen.ru/editor"
  : "https://www.reddit.com/";
const directory = join(homedir(), ".eterapy", "browser-sessions");
const outputPath = join(directory, `${platform}.storage-state.json`);

await mkdir(directory, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({ headless: false, channel: "chrome" });
const context = await browser.newContext({ locale: "ru-RU", timezoneId: "Europe/Moscow" });
const page = await context.newPage();
await page.goto(startUrl, { waitUntil: "domcontentloaded" });

const prompt = createInterface({ input: stdin, output: stdout });
try {
  await prompt.question(
    `Авторизуйтесь в открытом окне ${platform}, пройдите 2FA и нажмите Enter здесь. `
    + "Скрипт не печатает cookies и не обходит CAPTCHA.\n",
  );
  await context.storageState({ path: outputPath });
  await chmod(outputPath, 0o600);
  stdout.write(`Сессия сохранена локально: ${outputPath}\n`);
  stdout.write(
    `Скопируйте содержимое файла в поле ${
      platform === "dzen" ? "DZEN_BROWSER_STORAGE_STATE" : "REDDIT_BROWSER_STORAGE_STATE"
    } суперадминки.\n`,
  );
} finally {
  prompt.close();
  await context.close();
  await browser.close();
}
