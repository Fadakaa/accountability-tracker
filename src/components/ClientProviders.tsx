"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { AuthGuard } from "@/components/AuthGuard";
import { usePathname } from "next/navigation";

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
  // usePathname() works in client components (both web and Capacitor static builds)
  let pathname: string;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    pathname = usePathname();
  } catch {
    // Fallback for edge cases (e.g. Capacitor WebView)
    pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  }

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return <AuthGuard>{children}</AuthGuard>;
}
