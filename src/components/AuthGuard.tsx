"use client";

import { useAuth } from "@/components/AuthProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isCapacitor, setIsCapacitor] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Detect Capacitor after mount to avoid hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    setIsCapacitor(win.Capacitor !== undefined || win.capacitor !== undefined);
    setMounted(true);
  }, []);

  // Handle redirect for web (non-Capacitor) when not authenticated
  useEffect(() => {
    if (!mounted || isCapacitor) return;
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, mounted, isCapacitor]);

  // Before first client render, render nothing (avoids hydration mismatch)
  if (!mounted) {
    return null;
  }

  // In Capacitor, always render children — no auth gate needed
  if (isCapacitor) {
    return <>{children}</>;
  }

  // Web: show spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-500 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — will redirect momentarily
  if (!user) {
    return null;
  }

  return <>{children}</>;
}
