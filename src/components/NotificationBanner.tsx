"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { isCapacitor } from "@/lib/capacitorUtils";
import {
  checkNativeNotificationPermission,
  requestNativeNotificationPermission,
  sendNativeTestNotification,
  rescheduleAllNativeNotifications,
} from "@/lib/nativeNotifications";

// ─── Native (Capacitor) Banner ───────────────────────────
function NativeBanner({ onDismiss }: { onDismiss: () => void }) {
  const [permStatus, setPermStatus] = useState<"checking" | "granted" | "denied" | "prompt">("checking");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    checkNativeNotificationPermission().then((granted) => {
      if (granted) {
        // Already granted — auto-dismiss the banner
        onDismiss();
      } else {
        setPermStatus("prompt");
      }
    });
  }, [onDismiss]);

  async function handleEnableNotifications() {
    setPermStatus("checking");
    const granted = await requestNativeNotificationPermission();
    if (granted) {
      // Schedule all notifications now that we have permission
      await rescheduleAllNativeNotifications();
      setPermStatus("granted");
      // Send a test and auto-dismiss after a moment
      setTestStatus("sending");
      try {
        await sendNativeTestNotification();
        setTestStatus("sent");
        setTimeout(() => onDismiss(), 3000);
      } catch {
        setTestStatus("error");
      }
    } else {
      setPermStatus("denied");
    }
  }

  if (permStatus === "checking") return null;
  if (permStatus === "granted") return null;

  return (
    <div className="mx-4 mb-4 rounded-xl bg-surface-800 border border-brand/30 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔔</span>
          <span className="text-sm font-semibold">Enable Notifications</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-neutral-600 text-xs hover:text-neutral-400"
        >
          ✕
        </button>
      </div>

      {permStatus === "denied" ? (
        <div>
          <p className="text-xs text-neutral-400 mb-3">
            Notifications are blocked. Go to{" "}
            <span className="text-white font-medium">Settings → Notifications</span> on your
            phone to enable them for this app.
          </p>
          <button
            onClick={onDismiss}
            className="w-full rounded-lg py-2 text-sm font-medium bg-surface-700 text-neutral-300 hover:text-white transition-colors"
          >
            Got it
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs text-neutral-400 mb-3">
            Get check-in reminders and Fibonacci escalation alerts delivered straight to your lock screen.
          </p>
          <button
            onClick={handleEnableNotifications}
            disabled={testStatus === "sending"}
            className={`w-full rounded-lg py-2 text-sm font-bold transition-all active:scale-[0.98] ${
              testStatus === "sent"
                ? "bg-done/20 text-done border border-done/30"
                : testStatus === "error"
                  ? "bg-missed/20 text-missed border border-missed/30"
                  : "bg-brand hover:bg-brand-dark text-white"
            }`}
          >
            {testStatus === "sending"
              ? "Setting up..."
              : testStatus === "sent"
                ? "✓ Notifications enabled!"
                : testStatus === "error"
                  ? "Failed — try again"
                  : "Enable Notifications"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Web (ntfy.sh) Banner ────────────────────────────────
function NtfyBanner({ onDismiss }: { onDismiss: () => void }) {
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleTest() {
    setTestStatus("sending");
    try {
      const res = await fetch(apiUrl("/api/notify/test"), { method: "POST" });
      if (res.ok) {
        setTestStatus("sent");
        setTimeout(() => onDismiss(), 3000);
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
          onClick={onDismiss}
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
        <Link
          href="/settings"
          className="flex-1 rounded-lg py-2 text-sm font-medium bg-surface-700 text-neutral-300 text-center hover:text-white transition-colors"
        >
          Setup Guide
        </Link>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────
export default function NotificationBanner() {
  const [dismissed, setDismissed] = useState(false);

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

  if (isCapacitor()) {
    return <NativeBanner onDismiss={handleDismiss} />;
  }

  return <NtfyBanner onDismiss={handleDismiss} />;
}
