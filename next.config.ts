import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Exclude tests directory from Next.js build
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
};

export default nextConfig;
