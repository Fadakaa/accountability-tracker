"use client";

import { useEffect } from "react";

/**
 * In Capacitor static builds, <a href="/checkin"> navigates to /checkin
 * but the WebView needs /checkin/ (with trailing slash) to find checkin/index.html.
 * This interceptor catches all internal link clicks and fixes the path.
 */
export function CapacitorLinkInterceptor() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const isCap = win.Capacitor !== undefined || win.capacitor !== undefined;
    if (!isCap) return;

    function handleClick(e: MouseEvent) {
      // Find the closest <a> tag
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Only handle internal links (starting with /)
      if (!href.startsWith("/")) return;

      // Don't handle links to static files
      if (href.includes(".")) return;

      e.preventDefault();

      // Parse the href to handle query strings
      const [path, query] = href.split("?");

      // Add trailing slash if missing (so /checkin becomes /checkin/)
      const fixedPath = path.endsWith("/") ? path : path + "/";
      const fullUrl = query ? `${fixedPath}?${query}` : fixedPath;

      // Navigate — this causes a full page load in Capacitor but now finds the right index.html
      window.location.href = fullUrl;
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
