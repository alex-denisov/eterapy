export interface SecurityHeader {
  key: string;
  value: string;
}

function csp() {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vk.com https://*.vk.com https://id.vk.com",
    "connect-src 'self' https: wss: ws:",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src https://yoomoney.ru https://*.yookassa.ru https://id.vk.com https://vk.com",
    "form-action 'self' https://yoomoney.ru https://*.yookassa.ru",
  ];
  return directives.join("; ");
}

export function securityHeaders(): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: csp() },
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
