import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // Render the branded recovery page for unmatched public URLs.
    globalNotFound: true,
  },
};

export default nextConfig;
