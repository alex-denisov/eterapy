import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["eterapy.com", "www.eterapy.com"],
  turbopack: {
    root: __dirname,
  },
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
};

export default nextConfig;
