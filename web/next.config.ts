import type { NextConfig } from "next";
import path from "node:path";
import { baseSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["eterapy.com", "www.eterapy.com"],
  // B667: релизный образ несёт не установленные node_modules, а трассированное
  // дерево. `node_modules` занимал 1.1 ГБ из 2.0 ГБ образа, и платили за это
  // четыре ноды при каждой выкатке. Сборку дособирает
  // `scripts/build-standalone.mjs`: статика, public, бандлы воркеров и проверки
  // целостности дерева (см. тикет B667).
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  // B431: the legal pages render from this Markdown pack at request time; make sure
  // it is always traced/included alongside the route.
  outputFileTracingIncludes: {
    "/legal/[doc]": ["./src/content/legal-pack.md"],
  },
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
  // B523/INC-066: the app host serves the /cabinet tree via ROUTER-level
  // rewrites (beforeFiles + host match) instead of a middleware
  // NextResponse.rewrite. A middleware rewrite behind nginx cannot stay
  // internal: x-forwarded-proto=https makes any origin-matching target
  // https://localhost (EPROTO against the plaintext listener), and the only
  // working http target is treated as an EXTERNAL rewrite — Next re-requests
  // itself, the second middleware pass strips the CSP nonce marker (B477
  // guard), and the cabinet ships 'unsafe-inline'. Router rewrites resolve
  // in-process after middleware, so the nonce request header survives and the
  // self-proxy hop disappears. Middleware keeps auth/redirect/CSP logic only.
  async rewrites() {
    // Single-host mode (local dev, bare-IP/one-domain test VMs): every host
    // equals the "app domain", so the host-matched rules would swallow the
    // whole public site into /cabinet/*. Path-level auth handles this mode.
    if (process.env.NEXT_PUBLIC_USE_SUBDOMAINS !== "true") {
      return { beforeFiles: [] };
    }
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "app.eterapy.com";
    const appHost = [{ type: "host" as const, value: appDomain }];
    return {
      beforeFiles: [
        { source: "/", has: appHost, destination: "/cabinet" },
        {
          // Mirrors the middleware pass-through set: /cabinet* (already
          // prefixed), /help, /auth/*, /callback/* (ALWAYS_ALLOW), api/_next
          // and any dotted file (excluded from the middleware matcher too).
          source:
            "/:path((?!cabinet(?:$|/)|help(?:$|/)|auth/|callback/|api/|_next/|__product-not-found(?:$|/)|.*\\.).*)",
          has: appHost,
          destination: "/cabinet/:path",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value: '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", </llms.txt>; rel="describedby"; type="text/plain"',
          },
        ],
      },
      {
        // B523: base hardening-заголовки — на КАЖДЫЙ путь (HSTS/анти-clickjacking
        // и для api/_next/static). CSP-заголовок документа выставляет proxy.ts,
        // где есть host/path контекст и per-request nonce, — так на HTML нет
        // двух конкурирующих CSP-политик.
        source: "/:path*",
        headers: baseSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
