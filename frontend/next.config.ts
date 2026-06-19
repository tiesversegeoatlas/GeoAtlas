import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.GEOATLAS_API_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/geoatlas/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;
