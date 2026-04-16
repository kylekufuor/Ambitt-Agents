import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // SOP uploads at agent creation — multi-file PDFs can easily exceed 1MB.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
