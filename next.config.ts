import type { NextConfig } from "next";
import { existsSync, renameSync } from "fs";
import { join } from "path";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

// ─── Capacitor static-export: hide API routes ───
// API routes cannot be statically exported (they need a server).
// During Capacitor builds we temporarily rename src/app/api → src/app/_api
// so Next.js's filesystem scanner ignores them (underscore = private folder).
// A cleanup handler restores the directory when the process exits.
const API_DIR = join(__dirname, "src", "app", "api");
const API_HIDDEN = join(__dirname, "src", "app", "_api");

if (isCapacitorBuild && existsSync(API_DIR) && !existsSync(API_HIDDEN)) {
  renameSync(API_DIR, API_HIDDEN);

  // Restore on any exit (success, error, or signal)
  const restore = () => {
    try {
      if (existsSync(API_HIDDEN) && !existsSync(API_DIR)) {
        renameSync(API_HIDDEN, API_DIR);
      }
    } catch { /* best effort */ }
  };
  process.on("exit", restore);
  process.on("SIGINT", () => { restore(); process.exit(130); });
  process.on("SIGTERM", () => { restore(); process.exit(143); });
  process.on("uncaughtException", (err) => { restore(); throw err; });
}
// ─────────────────────────────────────────────────

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
