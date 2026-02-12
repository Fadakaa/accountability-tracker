// API base URL — resolves to relative path on web, full URL in Capacitor
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://accountability-tracker-sandy.vercel.app";

// In Capacitor (native app), API calls must go to the Vercel server
// On web (Vercel), relative paths work fine
function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor sets window.Capacitor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).Capacitor !== undefined) return true;
  // Fallback: check if running from capacitor:// scheme
  if (window.location.protocol === "capacitor:") return true;
  return false;
}

export function apiUrl(path: string): string {
  if (isNativeApp()) {
    return `${APP_URL}${path}`;
  }
  return path;
}
