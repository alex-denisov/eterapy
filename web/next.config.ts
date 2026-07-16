import type { NextConfig } from "next";
import path from "node:path";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["eterapy.com", "www.eterapy.com"],
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
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
};

export default nextConfig;
