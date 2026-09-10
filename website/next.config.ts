import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // The editorial pages (app/route.ts, app/use-cases/route.ts) are route
  // handlers, and Next 16.2 copies a route handler's headers onto the response
  // with appendHeader(), which stores Content-Type as an array. The built-in
  // compression middleware only compresses a string Content-Type, so those
  // ~1 MB documents went out uncompressed (Railway's edge does not compress
  // either). A Content-Type set here lands first, as a plain string; Next then
  // skips its own copy and gzip applies: about 1,070 kB down to 700 kB.
  // Safe to delete once `curl -H 'Accept-Encoding: gzip' -I /` shows gzip
  // without it.
  async headers() {
    return ["/", "/use-cases"].map((source) => ({
      source,
      headers: [{ key: "Content-Type", value: "text/html; charset=utf-8" }],
    }));
  },
};

export default nextConfig;
