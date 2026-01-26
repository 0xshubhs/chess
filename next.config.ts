import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark redis as external - it's dynamically imported and optional
  serverExternalPackages: ['redis'],
};

export default nextConfig;
