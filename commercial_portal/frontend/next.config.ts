import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.PORTAL_API_URL || "http://127.0.0.1:8100";
    return [
      {
        source: "/api/portal/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;
