"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /wrap now redirects to /coach?mode=review
 * The wrap card carousel lives inside the unified Coach page.
 */
export default function WrapRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/coach?mode=review");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-neutral-500 text-sm">Redirecting to Coach...</p>
    </div>
  );
}
