// Shared Capacitor detection utility — single source of truth
// Import this instead of duplicating the check in every file

export function isCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return win.Capacitor !== undefined || win.capacitor !== undefined;
}
