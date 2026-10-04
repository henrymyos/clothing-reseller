import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/inventory", destination: "/shop", permanent: true }];
  },
};

export default nextConfig;
