"use client";

import { useState } from "react";

export default function NotificationBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  // Check if the user has seen this banner before
  if (typeof window !== "undefined" && localStorage.getItem("ntfy-banner-dismissed")) {
    return null;
  }

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("ntfy-banner-dismissed", "1");
    }
  }

  async function handleTest() {
    setTestStatus("sending");
    try {
      const res = await fetch("/api/notify/test", { method: "POST" });
      if (res.ok) {
        setTestStatus("sent");
        setTimeout(() => {
          handleDismiss();
        }, 3000);
      } else {
        setTestStatus("error");
      }
    } catch {
      setTestStatus("error");
    }
  }

  return (
    <div className="mx-4 mb-4 rounded-xl bg-surface-800 border border-brand/30 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">📱</span>
          <span className="text-sm font-semibold">Phone notifications</span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-neutral-600 text-xs hover:text-neutral-400"
        >
          ✕
        </button>
      </div>
      <p className="text-xs text-neutral-400 mb-3">
        Install the <span className="text-white font-medium">ntfy</span> app, subscribe to topic <code className="text-brand font-bold">accountability-mk-662c59e795fd</code> to get 6 daily check-ins + Fibonacci escalation.
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={testStatus === "sending"}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all active:scale-[0.98] ${
            testStatus === "sent"
              ? "bg-done/20 text-done border border-done/30"
              : testStatus === "error"
                ? "bg-missed/20 text-missed border border-missed/30"
                : "bg-brand hover:bg-brand-dark text-white"
          }`}
        >
          {testStatus === "sending"
            ? "Sending..."
            : testStatus === "sent"
              ? "✓ Check your phone!"
              : testStatus === "error"
                ? "Failed — see Settings"
                : "Test Notification"}
        </button>
        <a
          href="/settings"
          className="flex-1 rounded-lg py-2 text-sm font-medium bg-surface-700 text-neutral-300 text-center hover:text-white transition-colors"
        >
          Setup Guide
        </a>
      </div>
    </div>
  );
}
