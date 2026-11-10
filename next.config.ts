import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Exclude tests directory from Next.js build
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = {
        type: "memory",
      };
    }
    return config;
  },
};

export default nextConfig;
