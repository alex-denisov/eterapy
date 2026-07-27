export interface SecurityHeader {
  key: string;
  value: string;
}

// B579: `googletagmanager.com` убран вместе с Google Analytics. Оставленный
// хост означал бы, что счётчик возвращается одной переменной сборки, а запрет
// на передачу данных в GA — не про переменную.
const SCRIPT_HOSTS = [
  "https://vk.com",
  "https://*.vk.com",
  "https://id.vk.com",
  "https://mc.yandex.ru",
  "https://telegram.org",
  "https://oauth.telegram.org",
];

/**
 * INC-069: хеш пре-paint инлайн-скрипта из `PRE_PAINT_INLINE_SCRIPT` (детект
 * mini-app + подсказка состояния шапки, B604 — одна строка, один хеш).
 *
 * ПОЧЕМУ ХЕШ, А НЕ НОНС. Next выводит `<Script strategy="beforeInteractive">` в
 * документ дважды: копию через `__next_s` — с нонсом, и сырой `<script>` — без
 * нонса. Сырую копию enforce-политика режет. Пробросить нонс в layout нельзя
 * даром: чтобы его прочитать, корневой layout должен позвать `headers()`, а это
 * переводит В ДИНАМИКУ ВСЁ дерево — включая 397 статических страниц библиотеки
 * (ровно то, что чинит INC-080). Хеш такой цены не имеет.
 *
 * ⚠ Хеш обязан совпадать со скриптом. Забыть обновить его нельзя: за этим
 * следит прогон `inc069-miniapp-script-hash`, который считает sha256 от самой
 * константы и падает при расхождении.
 */
export const PRE_PAINT_SCRIPT_CSP_HASH = "'sha256-pLyIPT6DwVpD/+z4wxjUjs3AD1+tPNhTD+QwjajYvXo='";

export function cspValue(options: { production: boolean; reportOnly?: boolean; nonce?: string }) {
  // B523: с nonce (аутентифицированные /cabinet и /admin — всегда динамический
  // рендер) script-src живёт БЕЗ 'unsafe-inline'; Next подхватывает nonce из
  // request-заголовка Content-Security-Policy и проставляет его своим
  // inline-скриптам. Статические страницы (маркетинговый лендинг, 340+ prerender-
  // страниц) не могут получить per-request nonce → там остаётся 'unsafe-inline'
  // + строгая report-only телеметрия.
  const scriptSources = [
    "'self'",
    ...(options.nonce ? [`'nonce-${options.nonce}'`] : []),
    // INC-069: сырая копия `miniapp-detect` нонса не получает — разрешаем её
    // по хешу там, где 'unsafe-inline' нет (nonce-политика и report-only).
    ...(options.nonce || options.reportOnly ? [PRE_PAINT_SCRIPT_CSP_HASH] : []),
    ...(!options.reportOnly && !options.nonce ? ["'unsafe-inline'"] : []),
    ...(!options.production && !options.reportOnly ? ["'unsafe-eval'"] : []),
    ...SCRIPT_HOSTS,
  ];
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSources.join(" ")}`,
    // Inline-обработчики (onclick=…) не используются React-кодом — режем их
    // как XSS-вектор в nonce-политике и собираем телеметрию в report-only.
    ...(options.nonce || options.reportOnly ? ["script-src-attr 'none'"] : []),
    "connect-src 'self' https: wss: ws:",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src https://yoomoney.ru https://*.yookassa.ru https://id.vk.com https://vk.com https://oauth.telegram.org https://telegram.org",
    "form-action 'self' https://yoomoney.ru https://*.yookassa.ru",
    ...(options.reportOnly || options.nonce ? ["report-uri /api/csp-report"] : []),
  ];
  return directives.join("; ");
}

/** Все hardening-заголовки, КРОМЕ CSP. Ставятся глобально в next.config на
 *  каждый путь (включая api/_next/static — HSTS/анти-clickjacking везде). */
export function baseSecurityHeaders(): SecurityHeader[] {
  return [
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self)",
    },
  ];
}

/** Только CSP-заголовки. Для документов их выставляет proxy (там есть host/path
 *  контекст и per-request nonce); без nonce добавляется строгий report-only. */
export function cspHeaders(options: { production?: boolean; nonce?: string } = {}): SecurityHeader[] {
  const production = options.production ?? process.env.NODE_ENV === "production";
  return [
    { key: "Content-Security-Policy", value: cspValue({ production, nonce: options.nonce }) },
    ...(production && !options.nonce
      ? [{ key: "Content-Security-Policy-Report-Only", value: cspValue({ production, reportOnly: true }) }]
      : []),
  ];
}

/** Полный набор (base + CSP). Сохранён для обратной совместимости/тестов. */
export function securityHeaders(options: { production?: boolean; nonce?: string } = {}): SecurityHeader[] {
  return [...cspHeaders(options), ...baseSecurityHeaders()];
}
