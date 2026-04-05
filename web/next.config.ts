import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["eterapy.com", "www.eterapy.com"],
};

export default nextConfig;
