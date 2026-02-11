"use client";

import { useEffect, useState } from "react";
import {
  requestNotificationPermission,
  getNotificationPermission,
  startNotificationScheduler,
  getPendingEscalationCount,
} from "@/lib/notifications";

export default function NotificationBanner() {
  const [permission, setPermission] = useState<string>("default");
  const [pendingCount, setPendingCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const perm = getNotificationPermission();
    setPermission(perm);

    // If already granted, start scheduler
    if (perm === "granted") {
      startNotificationScheduler();
    }

    // Poll pending escalations every 30s
    const interval = setInterval(() => {
      setPendingCount(getPendingEscalationCount());
    }, 30000);
    setPendingCount(getPendingEscalationCount());

    return () => clearInterval(interval);
  }, []);

  async function handleEnable() {
    const granted = await requestNotificationPermission();
    setPermission(granted ? "granted" : "denied");
    if (granted) {
      startNotificationScheduler();
    }
  }

  // Show pending escalations banner
  if (pendingCount > 0) {
    return (
      <div className="mx-4 mb-4 rounded-xl bg-later/20 border border-later/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">⏰</span>
          <span className="text-sm text-later font-medium">
            {pendingCount} habit{pendingCount > 1 ? "s" : ""} pending
          </span>
        </div>
        <a
          href="/checkin"
          className="text-xs font-bold text-later hover:text-white transition-colors"
        >
          Resolve →
        </a>
      </div>
    );
  }

  // Permission prompt
  if (permission === "default" && !dismissed) {
    return (
      <div className="mx-4 mb-4 rounded-xl bg-surface-800 border border-brand/30 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <span className="text-sm font-semibold">Enable notifications</span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-neutral-600 text-xs hover:text-neutral-400"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-neutral-400 mb-3">
          Get check-in reminders at 7am, 1pm, and 9pm. The system chases you.
        </p>
        <button
          onClick={handleEnable}
          className="w-full rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-bold py-2.5 transition-colors active:scale-[0.98]"
        >
          Enable Push Notifications
        </button>
      </div>
    );
  }

  // Denied state
  if (permission === "denied" && !dismissed) {
    return (
      <div className="mx-4 mb-4 rounded-xl bg-surface-800 border border-missed/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔕</span>
            <span className="text-xs text-neutral-400">
              Notifications blocked. Enable in browser settings.
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-neutral-600 text-xs hover:text-neutral-400"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}
