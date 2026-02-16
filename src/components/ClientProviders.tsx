"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { AuthGuard } from "@/components/AuthGuard";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// Routes that do NOT require authentication
const PUBLIC_ROUTES = ["/login"];

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGatekeeper>{children}</AuthGatekeeper>
    </AuthProvider>
  );
}

function AuthGatekeeper({ children }: { children: React.ReactNode }) {
  const [clientPath, setClientPath] = useState<string | null>(null);

  // Try Next.js usePathname first
  let nextPathname: string | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    nextPathname = usePathname();
  } catch {
    // Will fall back to clientPath
  }

  // Get window.location.pathname after mount (for Capacitor)
  useEffect(() => {
    setClientPath(window.location.pathname);
  }, []);

  const pathname = nextPathname ?? clientPath ?? "/";

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return <AuthGuard>{children}</AuthGuard>;
}
