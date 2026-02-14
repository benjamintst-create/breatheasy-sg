import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.basemaps.cartocdn.com",
      },
    ],
  },
  turbopack: {},
};

export default nextConfig;
