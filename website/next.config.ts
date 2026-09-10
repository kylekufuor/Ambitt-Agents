import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // Two root layouts (app/(editorial) and app/(site)) leave no single layout
    // for an unmatched URL, so app/global-not-found.tsx supplies the 404.
    globalNotFound: true,
  },
};

export default nextConfig;
