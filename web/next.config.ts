import type { NextConfig } from "next";
import path from "node:path";

function securityHeaders() {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vk.com https://*.vk.com https://id.vk.com https://www.googletagmanager.com https://mc.yandex.ru https://telegram.org https://oauth.telegram.org",
    "connect-src 'self' https: wss: ws:",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src https://yoomoney.ru https://*.yookassa.ru https://id.vk.com https://vk.com https://oauth.telegram.org https://telegram.org",
    "form-action 'self' https://yoomoney.ru https://*.yookassa.ru",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
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

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["eterapy.com", "www.eterapy.com"],
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  turbopack: {
    root: path.join(process.cwd(), ".."),
  },
  // Turbopack disabled due to monorepo root resolution issues
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sun*.userapi.com" },
      { protocol: "https", hostname: "vk.com" },
      { protocol: "https", hostname: "*.vkuserphoto.ru" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
  async redirects() {
    // Move standalone product surfaces under /products/* so the URL
    // shape matches the catalogue and the v4.2 design. Old paths
    // keep working through 308 permanent redirects, so external
    // links and SEO equity stay intact.
    return [
      { source: "/pair", destination: "/products/pair", permanent: true },
      { source: "/circle", destination: "/products/circle", permanent: true },
      { source: "/missions", destination: "/products/missions", permanent: true },
    ];
  },
};

export default nextConfig;
