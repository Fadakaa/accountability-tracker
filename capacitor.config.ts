import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fadakaa.accountability",
  appName: "Accountability",
  webDir: "out", // Next.js static export directory
  server: {
    // In development, use the local dev server
    // In production, the app loads from the bundled static files
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    scheme: "Accountability",
  },
  plugins: {
    // Capacitor plugin configuration goes here
  },
};

export default config;
