import { chromium } from 'playwright';

const BASE = 'https://staging.eterapy.com';
const SHOT = '/private/tmp/claude-501/-Users-alexeydenisov-Projects-eterapy/cf7f2d47-395c-4f23-8bc3-14a2db66b8b3/scratchpad';
const log = (...a) => console.log(a.join(' '));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  httpCredentials: { username: 'staging', password: 'EterapyStage!2026' },
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const { csrfToken } = await (await ctx.request.get(`${BASE}/api/auth/csrf`)).json();
await ctx.request.post(`${BASE}/api/auth/callback/credentials`, {
  form: { csrfToken, email: 'client@test.eterapy.com', password: 'test1234', callbackUrl: `${BASE}/miniapp` },
  maxRedirects: 0, failOnStatusCode: false,
});
await ctx.route('https://telegram.org/js/telegram-web-app.js', (r) =>
  r.fulfill({ contentType: 'application/javascript', body: 'void 0;' }));
await ctx.addInitScript(() => {
  const l = {};
  window.Telegram = { WebApp: {
    colorScheme: 'dark',
    get viewportHeight() { return window.visualViewport ? window.visualViewport.height : window.innerHeight; },
    viewportStableHeight: 844,
    safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    ready() {}, expand() {},
    onEvent(e, cb) { (l[e] ||= []).push(cb); }, offEvent() {},
    BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    MainButton: { show() {}, hide() {}, setText() {}, onClick() {}, offClick() {} },
  } };
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

// 1. Ни одно фокусируемое поле не должно быть меньше 16px (иначе iOS зумит)
log('--- 1. iOS zoom floor ---');
for (const [path, label] of [
  ['/miniapp?miniapp=telegram', 'Home'],
  ['/miniapp/checkin?miniapp=telegram', 'Check-in'],
  ['/miniapp/account?miniapp=telegram', 'Login'],
  ['/miniapp/diary?miniapp=telegram', 'Diary'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea, select')) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.push(`${el.tagName.toLowerCase()}#${el.id || '?'}=${fs}px`);
    }
    return out;
  });
  log(`  ${label.padEnd(10)} ${bad.length === 0 ? '✅ all fields >=16px' : `❌ ${bad.join(', ')}`}`);
}

// 2. Мелкий текст на Профиле — жалоба owner про «еле виден»
log('--- 2. smallest rendered text ---');
await page.goto(`${BASE}/miniapp/profile?miniapp=telegram`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const smallest = await page.evaluate(() => {
  const sizes = new Map();
  for (const el of document.querySelectorAll('body *')) {
    if (!el.textContent?.trim() || el.children.length) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (!sizes.has(fs)) sizes.set(fs, el.textContent.trim().slice(0, 40));
  }
  return [...sizes.entries()].sort((a, b) => a[0] - b[0]).slice(0, 4);
});
for (const [size, sample] of smallest) log(`  ${size}px — "${sample}"`);
await page.screenshot({ path: `${SHOT}/r2-profile.png` });

// 3. Клавиатура: композер виден, навигация скрыта, тред у последнего сообщения
log('--- 3. keyboard contract ---');
await page.goto(`${BASE}/miniapp/checkin?miniapp=telegram`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const input = page.locator('textarea').first();
await input.fill('Мне трудно решиться на смену работы, хожу по кругу уже месяц.');
await page.locator('button:has-text("Отправить"), button[type="submit"]').first().click();
await page.waitForTimeout(9000);
await page.screenshot({ path: `${SHOT}/r2-dialogue.png` });
const composer = page.locator('textarea').last();
await composer.click();
await page.setViewportSize({ width: 390, height: 420 });
await page.waitForTimeout(1600);
const k = await page.evaluate(() => {
  const thread = document.querySelector('.soft-chat-thread');
  const nav = document.querySelector('nav');
  const navStyle = nav ? getComputedStyle(nav) : null;
  const el = document.activeElement;
  const r = el?.getBoundingClientRect?.();
  return {
    kbd: document.documentElement.dataset.miniappKeyboardOpen,
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    navHidden: navStyle ? navStyle.display === 'none' || Number(navStyle.opacity) === 0 : null,
    composerBottom: r ? Math.round(r.bottom) : null, innerH: window.innerHeight,
    atBottom: thread ? Math.abs(thread.scrollHeight - thread.scrollTop - thread.clientHeight) < 40 : null,
  };
});
log(`  keyboard flag=${k.kbd} width=${k.sw}/${k.cw} ${k.sw > k.cw ? '❌ OVERFLOW' : '✅ no overflow'}`);
log(`  composer ${k.composerBottom} <= ${k.innerH} → ${k.composerBottom <= k.innerH ? '✅ visible' : '❌ clipped'}`);
log(`  bottom nav hidden: ${k.navHidden ? '✅' : '❌'}`);
log(`  thread scrolled to newest: ${k.atBottom ? '✅' : '❌'}`);
await page.screenshot({ path: `${SHOT}/r2-keyboard.png` });
await page.setViewportSize({ width: 390, height: 844 });

// 4. Диалог: подсказки скрыты, приветствие убрано
await page.waitForTimeout(800);
const d = await page.evaluate(() => {
  const chips = document.querySelector('[data-testid="dialogue-clarifying-chips"]');
  return {
    chipsShown: chips ? getComputedStyle(chips).display !== 'none' : false,
    hasCannedGreeting: document.body.innerText.includes('Спасибо, что доверились'),
    text: document.body.innerText.slice(0, 700),
  };
});
log('--- 4. dialogue content ---');
log(`  chips hidden: ${d.chipsShown ? '❌ still shown' : '✅'}`);
log(`  canned greeting gone: ${d.hasCannedGreeting ? '❌ present' : '✅'}`);
log(`  THREAD:\n${d.text}`);

// 5. Дневник — реальные даты
log('--- 5. diary dates ---');
await page.goto(`${BASE}/miniapp/diary?miniapp=telegram`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const strip = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Практика на этой неделе"] b')].map((b) => b.textContent.trim()));
const expected = (() => {
  const t = new Date(); const m = new Date(t); m.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return String(d.getDate()); });
})();
log(`  week strip: ${JSON.stringify(strip)}`);
log(`  expected  : ${JSON.stringify(expected)} → ${strip.every((v, i) => v === expected[i] || v === '') ? '✅ real dates' : '⚠ check'}`);

log(`console errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none ✅'}`);
await browser.close();
