import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // Baseline hardening: no MIME sniffing, no framing by other sites (nothing embeds this app).
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/inventory", destination: "/shop", permanent: true }];
  },
};

export default nextConfig;
