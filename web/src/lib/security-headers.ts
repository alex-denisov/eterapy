export interface SecurityHeader {
  key: string;
  value: string;
}

const SCRIPT_HOSTS = [
  "https://vk.com",
  "https://*.vk.com",
  "https://id.vk.com",
  "https://www.googletagmanager.com",
  "https://mc.yandex.ru",
  "https://telegram.org",
  "https://oauth.telegram.org",
];

function csp(options: { production: boolean; reportOnly?: boolean }) {
  const scriptSources = [
    "'self'",
    ...(!options.reportOnly ? ["'unsafe-inline'"] : []),
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
    "connect-src 'self' https: wss: ws:",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src https://yoomoney.ru https://*.yookassa.ru https://id.vk.com https://vk.com https://oauth.telegram.org https://telegram.org",
    "form-action 'self' https://yoomoney.ru https://*.yookassa.ru",
    ...(options.reportOnly ? ["report-uri /api/csp-report"] : []),
  ];
  return directives.join("; ");
}

export function securityHeaders(options: { production?: boolean } = {}): SecurityHeader[] {
  const production = options.production ?? process.env.NODE_ENV === "production";
  return [
    { key: "Content-Security-Policy", value: csp({ production }) },
    ...(production
      ? [{ key: "Content-Security-Policy-Report-Only", value: csp({ production, reportOnly: true }) }]
      : []),
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
