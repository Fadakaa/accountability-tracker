// Network status detection for offline-first sync

type OnlineCallback = (online: boolean) => void;

const listeners = new Set<OnlineCallback>();

/** Check if the browser reports being online */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine;
}

/** Subscribe to online/offline transitions. Returns unsubscribe function. */
export function onOnlineChange(callback: OnlineCallback): () => void {
  if (typeof window === "undefined") return () => {};

  listeners.add(callback);

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    listeners.delete(callback);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

/** One-time check: can we actually reach Supabase? (navigator.onLine can lie) */
export async function canReachSupabase(): Promise<boolean> {
  if (!isOnline()) return false;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/rest/v1/`, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok || res.status === 401; // 401 = reachable but needs auth
  } catch {
    return false;
  }
}
