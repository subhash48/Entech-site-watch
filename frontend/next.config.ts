import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The readings explorer moved to /sensors; keep old links working.
  async redirects() {
    return [{ source: "/readings", destination: "/sensors", permanent: false }];
  },
};

export default nextConfig;
