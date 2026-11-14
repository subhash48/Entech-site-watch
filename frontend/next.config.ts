import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // E2E tests build into their own directory so they never collide with a running `next dev`.
  // Unset everywhere else (including Vercel), which keeps the default .next.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // The readings explorer moved to /sensors; keep old links working.
  async redirects() {
    return [{ source: "/readings", destination: "/sensors", permanent: false }];
  },
};

export default nextConfig;
