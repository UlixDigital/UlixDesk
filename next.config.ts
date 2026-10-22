import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // SVG through the image optimizer is GHSA-2464-fhr4-w9xw. Leave this off.
  images: {
    dangerouslyAllowSVG: false,
  },
  serverExternalPackages: ["@node-rs/argon2", "pg", "pdfkit", "nodemailer"],
  async headers() {
    return [
      {
        source: "/v/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
