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
 * Адрес, куда сервису разрешено ходить.
 *
 * Адреса приходят от приложения: там они выводятся из настроек площадки и
 * покрыты тестами (`marketing/dzen-studio.ts`). Сервис их только проверяет —
 * иначе маркер к нему превратился бы в право сходить куда угодно чужими
 * куками.
 */
function checkedUrl(value, allowedHosts, what) {
  let parsed;
  try {
    parsed = new URL(String(value ?? ""));
  } catch {
    throw new Error(`Приложение не передало ${what}`);
  }
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new Error(`${what} ведёт на посторонний хост «${parsed.hostname}»`);
  }
  return parsed.toString();
}

const studioUrlOf = (value) => checkedUrl(value, ["dzen.ru"], "адрес студии");
const channelUrlOf = (value) => checkedUrl(value, ["dzen.ru"], "адрес канала");
const loginUrlOf = (value) => checkedUrl(value, ["passport.yandex.ru", "dzen.ru"], "адрес формы входа");

/**
 * Адрес студии по странице канала.
 *
 * ⚠ ПОЧЕМУ ЕГО НЕЛЬЗЯ СЛОЖИТЬ ИЗ СЛАГА. Студия открывается только по
 * `/profile/editor/id/<id>`. Вид со слагом появляется в адресной строке ПОСЛЕ
 * загрузки студии (её SPA переписывает адрес), но холодный переход по нему
 * уводит на публичную страницу канала — и под живой сессией владельца тоже.
 * Проверено вживую 2026-08-07.
 *
 * Идентификатор берём оттуда, где его показывает сама площадка: на странице
 * канала под владельцем есть ссылка в студию («Продвигать канал»). Так владелец
 * не вводит руками строку, которую ему пришлось бы искать в разметке (тот же
 * приём, что с адресатом Meta в B693).
 */
async function discoverStudioUrl(page, channelUrl) {
  await page.goto(channelUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(2_500);
  const href = await page.locator('a[href*="/profile/editor/id/"]').first()
    .getAttribute("href").catch(() => null);
  const id = href?.match(/\/profile\/editor\/id\/([0-9a-z]{16,})/i)?.[1] ?? null;
  return id ? `https://dzen.ru/profile/editor/id/${id}` : null;
}

/**
 * Кто вошёл в профиль.
 *
 * `yandex_login` пустой, а `Session_id` вида `noauth:<время>` — это аноним.
 * Проверка живая и бесплатная: она не требует обращения к площадке вовсе, а
 * значит аноним не создаёт нам следа «робот ходит по расписанию и никогда не
 * публикует».
 */
async function signedInAccount(ctx) {
  const cookies = await ctx.cookies().catch(() => []);
  const login = cookies.find((cookie) => cookie.name === "yandex_login" && String(cookie.value ?? "").trim());
  if (login) return String(login.value).trim();
  const session = cookies.find((cookie) => cookie.name === "Session_id");
  if (session && !/^noauth:/i.test(String(session.value ?? ""))) return "аккаунт без имени в куках";
  return null;
}

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
 * ⚠ И ВТОРОЙ УРОК, ТОГО ЖЕ ДНЯ. Признак входа искался на странице
 * `/profile/editor`, которой у Дзена НЕТ: студия живёт по адресу
 * `/profile/editor/<канал>`. Проверка честно докладывала «студия не
 * открылась», и это была наша собственная ошибка, названная свойством
 * площадки. Поэтому теперь: сначала бесплатный признак из кук (кто вошёл),
 * потом дело (студия открылась, кнопка создания на месте), и в отказе — адрес,
 * заголовок и видимые кнопки, чтобы следующий разбор не требовал пересборки
 * образа.
 */
async function dzenSessionState({ studioUrl, channelUrl }) {
  const ctx = await ensureContext();
  const account = await signedInAccount(ctx);
  if (!account) {
    return {
      authorized: false,
      account: null,
      reason: "в браузере не вошёл никто — откройте окно входа и войдите в Яндекс ID",
    };
  }

  const page = await ctx.newPage();
  try {
    const studio = studioUrl ?? await discoverStudioUrl(page, channelUrl);
    if (!studio) {
      return {
        authorized: false,
        account,
        reason: `на странице канала нет ссылки в студию — аккаунт ${account} не владелец этого канала?`,
      };
    }
    await page.goto(studio, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_500);
    const url = page.url();
    if (/passport\.yandex|id\.yandex|\/auth(?:\/|$)|\/login/i.test(url)) {
      return { authorized: false, account, reason: `сессия аккаунта ${account} истекла — нужен повторный вход` };
    }
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 4_000);
    if (/captcha|подтвердите, что вы не робот/i.test(body)) {
      return { authorized: false, account, reason: "площадка показывает проверку — нужен вход владельца" };
    }
    // Ждём кнопку, а не смотрим один раз: студия — тяжёлое одностраничное
    // приложение, и «не успела нарисоваться» читалось бы как «не открылась».
    const created = await page.locator(DZEN_CREATE_SELECTORS.join(", ")).first()
      .waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
    if (created) return { authorized: true, account, reason: null };

    const title = (await page.title().catch(() => "")).trim();
    const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"]'))
      .map((element) => (element.textContent ?? "").trim())
      .filter(Boolean).slice(0, 8)).catch(() => []);
    return {
      authorized: false,
      account,
      reason: `студия не открылась под аккаунтом ${account}: адрес ${url}, страница «${title || "без заголовка"}»`
        + (buttons.length > 0 ? `, кнопки: ${buttons.join(", ")}` : ", кнопок на странице нет"),
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
  // Снято с живой студии 2026-08-07: кнопка создания — иконка «+» в шапке, без
  // единой буквы текста. Прежний список искал «Создать публикацию» и не нашёл
  // бы её никогда.
  '[data-testid="add-publication-button"]',
  'button:has-text("Написать статью")',
  'button:has-text("Создать публикацию")',
];

/** Пункт меню «+»: статья, а не пост и не видео. */
const DZEN_ARTICLE_SELECTORS = [
  'button:has-text("Написать статью")',
  '[role="menuitem"]:has-text("Написать статью")',
  '[role="menuitem"]:has-text("Статья")',
  'a:has-text("Написать статью")',
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

async function publishToDzen({ title, body, mediaUrl, studioUrl, channelUrl }) {
  if (!title?.trim() || !body?.trim()) throw new Error("У материала нет заголовка или текста");
  const channel = channelUrlOf(channelUrl);
  const media = await downloadMedia(mediaUrl ?? null);
  const ctx = await ensureContext();
  const page = await ctx.newPage();
  try {
    const studio = studioUrl ? studioUrlOf(studioUrl) : await discoverStudioUrl(page, channel);
    if (!studio) throw new Error("Не найдена студия канала: нужен вход владельца");
    await page.goto(studio, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await assertNoChallenge(page);
    if (/passport\.yandex|id\.yandex|\/login/i.test(page.url())) {
      throw new Error("Сессия Дзена истекла: владельцу нужно снова пройти подключение");
    }
    await humanPause(page, 1_200);

    // Студия — тяжёлое одностраничное приложение: к `domcontentloaded` шапки
    // ещё нет. Ждём саму кнопку, а не отсчитываем секунды.
    const createButton = page.locator(DZEN_CREATE_SELECTORS.join(", ")).first();
    const create = await createButton.waitFor({ state: "visible", timeout: 30_000 })
      .then(() => createButton)
      .catch(() => null);
    if (!create) throw new Error("Редактор Дзена изменился: кнопка создания публикации не найдена");

    /**
     * ⚠ МЕНЮ СОЗДАНИЯ ЖДЁМ, А НЕ ОТСЧИТЫВАЕМ. Первая версия нажимала «+» и
     * делала паузу в секунду, после чего искала пункт ОДИН раз. Меню рисуется
     * порталом и к этому мгновению существует не всегда — второй живой заход
     * 2026-08-07 упал именно так: «в меню создания нет пункта».
     *
     * Пауза, отмеренная на глаз, — это не ожидание, а ставка. Здесь ждём
     * появления самого пункта, а если меню не раскрылось — нажимаем «+» ещё
     * раз: первое нажатие иногда лишь переводит фокус в шапку.
     */
    const articleItem = page.locator(DZEN_ARTICLE_SELECTORS.join(", ")).first();
    let article = null;
    for (const attempt of [0, 1]) {
      await create.click();
      article = await articleItem.waitFor({ state: "visible", timeout: 8_000 })
        .then(() => articleItem)
        .catch(() => null);
      if (article) break;
      if (attempt === 0) await humanPause(page, 700);
    }
    if (!article) {
      const visible = await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="menuitem"]'))
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => (element.textContent ?? "").trim())
        .filter(Boolean).slice(0, 12)).catch(() => []);
      throw new Error(
        "Редактор Дзена изменился: в меню создания нет пункта «Написать статью»"
        + (visible.length > 0 ? `. Видимые кнопки: ${visible.join(", ")}` : ". Видимых кнопок нет вовсе"),
      );
    }
    await article.click();
    // Признак того, что редактор действительно открылся: адрес черновика.
    await page.waitForURL((url) => /\/edit(\/|\?|$)/i.test(url.toString()), { timeout: 40_000 })
      .catch(() => { throw new Error("Редактор Дзена не открылся: адрес черновика не появился"); });
    await humanPause(page, 1_500);

    /**
     * ⚠ ПОЛЯ РЕДАКТОРА — ДВА DRAFT.JS БЕЗ ЕДИНОЙ ПОДСКАЗКИ. Снято с живого
     * редактора 2026-08-07: заголовок и текст статьи это
     * `div[contenteditable="true"].public-DraftEditor-content` с
     * `role="textbox"`, БЕЗ `placeholder`, `data-placeholder` и `aria-label`.
     * Слова «Заголовок» и «Текст» на экране рисует сам Draft.js поверх пустого
     * блока, в разметке их нет. Прежний список искал именно подсказки и
     * закономерно не нашёл ничего: выпуск падал с «поле заголовка не найдено»
     * уже после того, как студия открылась и редактор загрузился.
     *
     * Различаются они только порядком: первый — заголовок, второй — текст.
     */
    const editors = page.locator('.public-DraftEditor-content[contenteditable="true"]');
    await editors.first().waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => { throw new Error("Редактор Дзена изменился: поля статьи не появились"); });
    if (await editors.count().catch(() => 0) < 2) {
      throw new Error("Редактор Дзена изменился: вместо двух полей статьи найдено меньше");
    }
    const titleField = editors.first();
    const bodyField = editors.nth(1);

    await titleField.click();
    // Печатаем, а не вставляем: Draft.js — управляемый редактор, он принимает
    // ввод с клавиатуры и молча откатывает прямую подстановку значения.
    await titleField.pressSequentially(title.trim(), { delay: 45 });
    await humanPause(page, 800);

    await bodyField.click();
    // Текст длиннее, поэтому пауза между знаками меньше, а срок операции задан
    // явно: при трёх тысячах знаков умолчание в 20 секунд истекло бы посреди
    // ввода и оставило бы половину статьи в черновике.
    await bodyField.pressSequentially(body.trim(), { delay: 8, timeout: 150_000 });
    await humanPause(page, 1_200);

    if (media) {
      const fileInput = page.locator('input[type="file"][accept*="image"]').first();
      if (await fileInput.count().catch(() => 0) > 0) {
        await fileInput.setInputFiles(media.path);
        await humanPause(page, 2_500);
      }
    }

    const publish = await firstVisible(page, [
      // Снято с живого редактора 2026-08-07.
      '[data-testid="article-publish-btn"]',
      'button:has-text("Опубликовать")',
      '[role="button"]:has-text("Опубликовать")',
    ]);
    if (!publish) throw new Error("Редактор Дзена изменился: кнопка публикации не найдена");
    await publish.click();
    // Окно подтверждения появляется не мгновенно и не всегда. Ждём его
    // недолго: его отсутствие — законный исход, а вот «не дождались» выглядело
    // бы как «выпуск не подтверждён» и стоило бы материалу слота.
    const confirmSelectors = [
      '[role="dialog"] button:has-text("Опубликовать")',
      '[role="dialog"] button:has-text("Подтвердить")',
      '[role="dialog"] [data-testid*="publish"]',
    ];
    const confirm = page.locator(confirmSelectors.join(", ")).first();
    if (await confirm.waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false)) {
      await confirm.click();
    }

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
        // Отказ пробы — это ответ, а не поломка сервиса: сервис жив и обязан
        // сказать словами, что именно не так. Иначе экран покажет «сервис
        // недоступен» там, где недоступна всего лишь сессия.
        const state = url.searchParams.get("probe") === "1"
          ? await serial(() => dzenSessionState({
            studioUrl: url.searchParams.get("studio") ? studioUrlOf(url.searchParams.get("studio")) : null,
            channelUrl: channelUrlOf(url.searchParams.get("channel")),
          }))
            .catch((error) => ({
              authorized: false,
              account: null,
              reason: error instanceof Error ? error.message : String(error),
            }))
          : { authorized: null, reason: null, account: null };
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
        const payload = await readJson(request);
        // Окно наводится на ФОРМУ ВХОДА, а не на страницу площадки. Прежде оно
        // открывалось на `/profile/editor` — адресе, которого у Дзена нет: на
        // 404-странице площадки нет ни одной кнопки, и владелец не мог войти
        // вовсе. Если сессия жива, паспорт сам вернёт его в студию по retpath.
        const target = loginUrlOf(payload.loginUrl);
        await serial(async () => {
          const ctx = await ensureContext();
          if (!loginPage || loginPage.isClosed()) loginPage = await ctx.newPage();
          await loginPage.bringToFront().catch(() => undefined);
          await loginPage.goto(target, { waitUntil: "domcontentloaded", timeout: 40_000 })
            .catch(() => undefined);
          lastUsedAt = Date.now();
        });
        log("browser.login_window_opened", { target });
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
