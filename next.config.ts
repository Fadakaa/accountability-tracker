import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  // Static export for Capacitor native builds
  ...(isCapacitorBuild && { output: "export", trailingSlash: true }),

  // PWA headers for service worker scope (only for Vercel/server deployment)
  ...(!isCapacitorBuild && {
    async headers() {
      return [
        {
          source: "/sw.js",
          headers: [
            {
              key: "Service-Worker-Allowed",
              value: "/",
            },
            {
              key: "Cache-Control",
              value: "no-cache, no-store, must-revalidate",
            },
          ],
        },
      ];
    },
  }),
};

export default nextConfig;
