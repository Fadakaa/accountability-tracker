import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fadakaa.accountability",
  appName: "Accountability",
  webDir: "out", // Next.js static export directory
  server: {
    // Use https on both platforms — enables proper file resolution for static exports
    androidScheme: "https",
    iosScheme: "https",
  },
  ios: {
    contentInset: "automatic",
  },
  plugins: {
    LocalNotifications: {
      iconColor: "#f97316",
      sound: "default",
    },
    SpeechRecognition: {
      language: "en-GB",
      popup: false,
    },
  },
};

export default config;
