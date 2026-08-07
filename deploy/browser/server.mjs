/**
 * B698 — браузерная сессия владельца для площадок без API публикации.
 *
 * Сервис владеет ОДНИМ постоянным профилем и отдаёт наружу четыре ручки:
 *
 *   GET  /health          — жив ли браузер, есть ли профиль, авторизован ли он
 *   POST /session/open    — поднять окно для входа владельца
 *   POST /session/close   — погасить окно
 *   POST /publish/dzen    — выпустить материал, вернуть адрес публикации
 *
 * ПОЧЕМУ ПОСТОЯННЫЙ ПРОФИЛЬ, А НЕ СЛЕПОК COOKIES. Предыдущая попытка (B617)
 * возила `storageState` строкой в настройках площадки. Это профиль без
 * прошлого: свежие куки, пустые localStorage и IndexedDB, нулевая история. Для
 * антифрода такой набор подозрительнее любого флага драйвера. Здесь каталог
 * профиля живёт в томе и стареет естественно.
 *
 * ПОЧЕМУ НЕ HEADLESS. Chromium под Xvfb не отдаёт признаков headless-режима
 * вовсе, а стоит это одного лишнего процесса на десятки мегабайт.
 */

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "patchright";

const PORT = Number(process.env.BROWSER_CONTROL_PORT ?? 7801);
const VNC_PORT = Number(process.env.BROWSER_VNC_PORT ?? 7900);
const PROFILE_DIR = process.env.BROWSER_PROFILE_DIR ?? "/profile";
const TOKEN = process.env.BROWSER_CONTROL_TOKEN ?? "";
/** Через сколько простоя гасим браузер. Окно входа держим дольше — владелец мог отойти. */
const IDLE_MS = Number(process.env.BROWSER_IDLE_MS ?? 10 * 60_000);
const LOGIN_IDLE_MS = Number(process.env.BROWSER_LOGIN_IDLE_MS ?? 30 * 60_000);

if (!TOKEN) {
  console.error(JSON.stringify({ level: "error", event: "browser.token_missing" }));
  process.exit(1);
}

let context = null;
let loginPage = null;
let lastUsedAt = Date.now();
/** Одна операция за раз: параллельные сессии в одном профиле — это гонка за куки. */
let queue = Promise.resolve();

function log(event, extra = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...extra }));
}

function serial(task) {
  const run = queue.then(task, task);
  // Очередь не должна умирать от одного отказа — иначе сервис молча перестаёт
  // принимать работу и снаружи выглядит живым.
  queue = run.then(() => undefined, () => undefined);
  return run;
}

async function ensureContext() {
  if (context) {
    lastUsedAt = Date.now();
    return context;
  }
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    // Канал НЕ указываем: берём сборку, которую положил `patchright install
    // chromium`. `channel: "chromium"` потребовал бы отдельной установки канала
    // и падал бы на старте — а сервис обязан либо работать, либо сказать почему.
    headless: false,
    viewport: null,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--start-maximized",
      // Баннер «управляется автоматизированным ПО» — не признак робота сам по
      // себе, но его отсутствие делает окно неотличимым от обычного Chromium.
      "--disable-blink-features=AutomationControlled",
    ],
  });
  context.setDefaultTimeout(20_000);
  context.on("close", () => { context = null; loginPage = null; });
  lastUsedAt = Date.now();
  log("browser.context_opened");
  return context;
}

async function closeContext(reason) {
  if (!context) return;
  const closing = context;
  context = null;
  loginPage = null;
  await closing.close().catch(() => undefined);
  log("browser.context_closed", { reason });
}

setInterval(() => {
  if (!context) return;
  const limit = loginPage ? LOGIN_IDLE_MS : IDLE_MS;
  if (Date.now() - lastUsedAt < limit) return;
  void serial(() => closeContext("idle"));
}, 30_000).unref();

/**
 * Авторизован ли профиль.
 *
 * ⚠ ПОЧЕМУ ЗДЕСЬ ИЩЕТСЯ ПРИЗНАК ВХОДА, А НЕ ОТСУТСТВИЕ ОТКАЗА. Первая версия
 * считала сессию живой, если её не увели на паспорт и не показали капчу. Живая
 * проба прода 2026-08-07 показала, чего эта логика стоит: анониму Дзен отдаёт
 * НЕ редирект на паспорт, а собственную страницу «Дзен. Страница не найдена» с
 * кодом 200. Ни одного признака отказа — и экран админки бодро сообщал
 * «сессия жива, площадка узнаёт аккаунт», когда не входил ещё никто.
 *
 * Признаком входа считается ровно то, без чего выпуск невозможен: доступный
 * элемент создания публикации. Всё остальное — «не знаем», и говорить об этом
 * надо словами страницы, а не догадкой (тот же урок, что с адресатом Meta,
 * B685: «поля заполнены» и «площадка нас узнаёт» — разные утверждения).
 */
async function dzenSessionState() {
  const ctx = await ensureContext();
  const page = await ctx.newPage();
  try {
    await page.goto("https://dzen.ru/profile/editor", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_500);
    const url = page.url();
    if (/passport\.yandex|id\.yandex|\/auth(?:\/|$)|\/login/i.test(url)) {
      return { authorized: false, reason: "нужен вход в Яндекс" };
    }
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 4_000);
    if (/captcha|подтвердите, что вы не робот/i.test(body)) {
      return { authorized: false, reason: "площадка показывает проверку — нужен вход владельца" };
    }
    const create = await firstVisible(page, DZEN_CREATE_SELECTORS);
    if (create) return { authorized: true, reason: null };
    const title = (await page.title().catch(() => "")).trim();
    return {
      authorized: false,
      reason: `студия не открылась (страница «${title || "без заголовка"}») — нужен вход владельца`,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Элемент, без которого выпуск невозможен. Один список на проверку сессии и на
 * саму публикацию: разъедься они — «подключено» перестало бы означать
 * «получится выпустить», а это ровно то, что мы здесь и чиним.
 */
const DZEN_CREATE_SELECTORS = [
  'button:has-text("Создать публикацию")',
  '[role="button"]:has-text("Создать публикацию")',
  'button:has-text("Создать")',
];

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const present = await locator.count().catch(() => 0);
    if (present > 0 && await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

async function assertNoChallenge(page) {
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 5_000);
  if (/captcha|капч|подтвердите, что вы не робот|security check/i.test(body)) {
    throw new Error("Дзен показал проверку безопасности: нужен вход владельца через кнопку подключения");
  }
}

async function downloadMedia(mediaUrl) {
  if (!mediaUrl) return null;
  if (!/^https:\/\//i.test(mediaUrl)) throw new Error("Адрес обложки должен быть HTTPS");
  const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Обложка не скачалась: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error("По адресу обложки вернулась не картинка");
  const directory = await mkdtemp(join(tmpdir(), "eterapy-cover-"));
  const path = join(directory, contentType.includes("jpeg") ? "cover.jpg" : "cover.png");
  await writeFile(path, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
  return { directory, path };
}

/** Пауза со случайным разбросом: ровные интервалы — сами по себе признак робота. */
function humanPause(page, base) {
  return page.waitForTimeout(base + Math.floor(Math.random() * base));
}

async function publishToDzen({ title, body, mediaUrl }) {
  if (!title?.trim() || !body?.trim()) throw new Error("У материала нет заголовка или текста");
  const media = await downloadMedia(mediaUrl ?? null);
  const ctx = await ensureContext();
  const page = await ctx.newPage();
  try {
    await page.goto("https://dzen.ru/profile/editor", { waitUntil: "domcontentloaded", timeout: 40_000 });
    await assertNoChallenge(page);
    if (/passport\.yandex|id\.yandex|\/login/i.test(page.url())) {
      throw new Error("Сессия Дзена истекла: владельцу нужно снова пройти подключение");
    }
    await humanPause(page, 1_200);

    const create = await firstVisible(page, DZEN_CREATE_SELECTORS);
    if (!create) throw new Error("Редактор Дзена изменился: кнопка создания публикации не найдена");
    await create.click();
    await humanPause(page, 900);

    const article = await firstVisible(page, [
      '[role="menuitem"]:has-text("Статья")',
      'button:has-text("Статья")',
      'a:has-text("Статья")',
    ]);
    if (article) {
      await article.click();
      await humanPause(page, 1_500);
    }

    const titleField = await firstVisible(page, [
      'textarea[placeholder*="Заголов"]',
      'input[placeholder*="Заголов"]',
      '[contenteditable="true"][data-placeholder*="Заголов"]',
      '[contenteditable="true"][aria-label*="Заголов"]',
    ]);
    if (!titleField) throw new Error("Редактор Дзена изменился: поле заголовка не найдено");
    await titleField.click();
    // Заголовок печатается посимвольно: он короткий, а мгновенная вставка в
    // первое же поле — самый заметный признак автоматизации.
    await titleField.pressSequentially(title.trim(), { delay: 45 });
    await humanPause(page, 800);

    const bodyField = await firstVisible(page, [
      '[contenteditable="true"][data-placeholder*="текст"]',
      '[contenteditable="true"][aria-label*="текст"]',
      '.public-DraftEditor-content[contenteditable="true"]',
    ]) ?? await (async () => {
      const editors = page.locator('div[contenteditable="true"]');
      return await editors.count().catch(() => 0) > 1 ? editors.last() : null;
    })();
    if (!bodyField) throw new Error("Редактор Дзена изменился: поле текста статьи не найдено");
    await bodyField.click();
    // Текст статьи вставляется целиком, а не печатается: живой автор тоже
    // вставляет готовый черновик, а посимвольный ввод трёх тысяч знаков занял
    // бы минуты и держал бы сессию открытой без нужды.
    await bodyField.fill(body.trim());
    await humanPause(page, 1_200);

    if (media) {
      const fileInput = page.locator('input[type="file"][accept*="image"]').first();
      if (await fileInput.count().catch(() => 0) > 0) {
        await fileInput.setInputFiles(media.path);
        await humanPause(page, 2_500);
      }
    }

    const publish = await firstVisible(page, [
      'button:has-text("Опубликовать")',
      '[role="button"]:has-text("Опубликовать")',
    ]);
    if (!publish) throw new Error("Редактор Дзена изменился: кнопка публикации не найдена");
    await publish.click();
    const confirm = await firstVisible(page, [
      '[role="dialog"] button:has-text("Опубликовать")',
      '[role="dialog"] button:has-text("Подтвердить")',
    ]);
    if (confirm) await confirm.click();

    // Ждём именно адрес публикации, а не «страница загрузилась»: успехом
    // считается только то, что у материала появился публичный адрес.
    await page.waitForURL((url) => /^https:\/\/dzen\.ru\/(a|media)\//i.test(url.toString()), { timeout: 45_000 })
      .catch(() => undefined);
    await assertNoChallenge(page);
    const publicUrl = page.url();
    if (!/^https:\/\/dzen\.ru\//i.test(publicUrl) || /\/(editor|profile)(\/|$)/i.test(publicUrl)) {
      throw new Error("Дзен не вернул публичный адрес публикации");
    }
    const externalPostId = publicUrl.split("?")[0].split("/").filter(Boolean).at(-1) ?? title.trim();
    log("browser.dzen_published", { publicUrl });
    return { externalPostId, publicUrl };
  } finally {
    await page.close().catch(() => undefined);
    if (media) await rm(media.directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Слишком большое тело запроса");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(body);
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (request.headers["x-eterapy-browser-token"] !== TOKEN) {
        send(response, 401, { error: "Неверный маркер сервиса" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        // Проба площадки — ТОЛЬКО по явному запросу. Проверка контейнера
        // ходит сюда раз в минуту; если бы она каждый раз открывала dzen.ru,
        // мы сами создали бы ровно тот признак робота, от которого уходим:
        // обращение секунда в секунду, круглые сутки, без единой публикации.
        const state = url.searchParams.get("probe") === "1"
          ? await serial(() => dzenSessionState().catch((error) => ({
            authorized: false,
            reason: error instanceof Error ? error.message : String(error),
          })))
          : { authorized: null, reason: null };
        send(response, 200, {
          ok: true,
          profileExists: existsSync(join(PROFILE_DIR, "Default")),
          browserRunning: Boolean(context),
          loginWindowOpen: Boolean(loginPage),
          ...state,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/open") {
        await serial(async () => {
          const ctx = await ensureContext();
          if (!loginPage || loginPage.isClosed()) loginPage = await ctx.newPage();
          await loginPage.bringToFront().catch(() => undefined);
          await loginPage.goto("https://dzen.ru/profile/editor", { waitUntil: "domcontentloaded", timeout: 40_000 })
            .catch(() => undefined);
          lastUsedAt = Date.now();
        });
        log("browser.login_window_opened");
        send(response, 200, { ok: true, vncPort: VNC_PORT });
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/close") {
        await serial(async () => {
          if (loginPage && !loginPage.isClosed()) await loginPage.close().catch(() => undefined);
          loginPage = null;
        });
        send(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && url.pathname === "/publish/dzen") {
        const payload = await readJson(request);
        const result = await serial(() => publishToDzen(payload));
        send(response, 200, { ok: true, ...result });
        return;
      }

      send(response, 404, { error: "Неизвестная ручка" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("browser.request_failed", { path: url.pathname, error: message });
      send(response, 502, { error: message });
    }
  })();
});

server.headersTimeout = 180_000;
server.requestTimeout = 180_000;
server.listen(PORT, "0.0.0.0", () => log("browser.listening", { port: PORT }));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    void closeContext(signal).finally(() => process.exit(0));
  });
}
