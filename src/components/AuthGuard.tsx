"use client";

import { useAuth } from "@/components/AuthProvider";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      // Client-side redirect — works in both web and Capacitor
      window.location.href = "/login";
    }
  }, [user, loading]);

  // Show loading spinner while checking auth
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
