// Native iOS notifications via @capacitor/local-notifications
// Only call these functions after confirming isCapacitor() === true
//
// ID scheme:
//   1000-1099: Daily scheduled check-in notifications
//   2000-2999: Fibonacci escalation notifications
//   3000-3001: End-of-day notifications (11 PM warning, midnight)

import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { loadSettings } from "@/lib/store";
import type { NotificationSlot } from "@/lib/store";

// ─── ID Ranges ─────────────────────────────────────────────

const DAILY_ID_BASE = 1000;
const ESCALATION_ID_BASE = 2000;
const EOD_WARNING_ID = 3000;
const EOD_MIDNIGHT_ID = 3001;

// ─── Fibonacci escalation timing (cumulative minutes) ──────

const FIBONACCI_CUMULATIVE_MINS = [13, 21, 26, 29, 30]; // +13, +8, +5, +3, +1

const ESCALATION_MESSAGES = [
  "Just checking — did you get to [HABIT] yet?",
  "Still pending: [HABIT]. Small actions, ruthless consistency.",
  "⚠️ [HABIT] is still open. Even 30 seconds counts.",
  "🔴 [HABIT] — do it now. Relief later.",
  "Last call: [HABIT]. Yes or No. No more later.",
];

// ─── Daily notification messages ────────────────────────────

function getDailyMessage(ukHour: number): { title: string; body: string } {
  if (ukHour <= 8) {
    return {
      title: "🌅 Morning Check-in",
      body: "New day, new chance. Let's see what you've got.",
    };
  }
  if (ukHour <= 11) {
    return {
      title: "☕ Mid-Morning Check",
      body: "Morning habits done? Don't let them slip.",
    };
  }
  if (ukHour <= 14) {
    return {
      title: "☀️ Afternoon Check-in",
      body: "Midday stack is live. Show up.",
    };
  }
  if (ukHour <= 16) {
    return {
      title: "🎯 Mid-Afternoon Push",
      body: "Consistency compounds. Keep going.",
    };
  }
  if (ukHour <= 19) {
    return {
      title: "💪 Evening Prep",
      body: "Evening stack incoming. Finish strong.",
    };
  }
  return {
    title: "🌙 Evening Wrap-up",
    body: "Last call for today. Log everything honestly.",
  };
}

// ─── UK Time Conversion ────────────────────────────────────

/** Convert UK hour/minute to a local Date object for today (or tomorrow if already passed) */
function ukTimeToNextLocalDate(ukHour: number, ukMinute: number): Date {
  const now = new Date();

  // Get current time in UK timezone
  const ukFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const ukParts = ukFormatter.formatToParts(now);
  const ukYear = parseInt(ukParts.find((p) => p.type === "year")!.value);
  const ukMonth = parseInt(ukParts.find((p) => p.type === "month")!.value) - 1;
  const ukDay = parseInt(ukParts.find((p) => p.type === "day")!.value);
  const ukNowHour = parseInt(ukParts.find((p) => p.type === "hour")!.value);
  const ukNowMin = parseInt(ukParts.find((p) => p.type === "minute")!.value);

  // Build target UK time as a Date in UTC perspective
  // First, create a UK "now" date and a UK "target" date
  const ukNow = new Date(Date.UTC(ukYear, ukMonth, ukDay, ukNowHour, ukNowMin, 0));
  let ukTarget = new Date(Date.UTC(ukYear, ukMonth, ukDay, ukHour, ukMinute, 0));

  // If the target time has already passed today in UK, schedule for tomorrow
  if (ukTarget.getTime() <= ukNow.getTime()) {
    ukTarget = new Date(ukTarget.getTime() + 24 * 60 * 60 * 1000);
  }

  // Calculate the difference between UK target and UK now (in ms)
  const msUntilTarget = ukTarget.getTime() - ukNow.getTime();

  // The notification fires at: now + msUntilTarget
  return new Date(now.getTime() + msUntilTarget);
}

// ─── Permission ────────────────────────────────────────────

export async function requestNativeNotificationPermission(): Promise<boolean> {
  try {
    const result = await LocalNotifications.requestPermissions();
    return result.display === "granted";
  } catch (err) {
    console.warn("[nativeNotif] Permission request failed:", err);
    return false;
  }
}

export async function checkNativeNotificationPermission(): Promise<boolean> {
  try {
    const result = await LocalNotifications.checkPermissions();
    return result.display === "granted";
  } catch {
    return false;
  }
}

// ─── Daily Notifications ───────────────────────────────────

export async function scheduleNativeDailyNotifications(): Promise<void> {
  const settings = loadSettings();
  const slots: NotificationSlot[] = settings.notificationSlots || [];

  // Cancel existing daily notifications first
  const dailyIds = slots.map((_, i) => ({ id: DAILY_ID_BASE + i }));
  // Also cancel end-of-day notifications
  dailyIds.push({ id: EOD_WARNING_ID }, { id: EOD_MIDNIGHT_ID });

  try {
    await LocalNotifications.cancel({ notifications: dailyIds });
  } catch {
    // May fail if none are scheduled yet
  }

  // Schedule enabled slots
  const notifications = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot.enabled) continue;

    const fireAt = ukTimeToNextLocalDate(slot.ukHour, slot.ukMinute);
    const message = getDailyMessage(slot.ukHour);

    notifications.push({
      id: DAILY_ID_BASE + i,
      title: message.title,
      body: message.body,
      schedule: { at: fireAt },
      sound: "default",
      extra: { url: "/checkin" },
    });
  }

  // Schedule 11 PM warning (UK time)
  const warningAt = ukTimeToNextLocalDate(23, 0);
  notifications.push({
    id: EOD_WARNING_ID,
    title: "⏰ Day Almost Over",
    body: "Have you logged all your habits? Last chance before midnight.",
    schedule: { at: warningAt },
    sound: "default",
    extra: { url: "/checkin" },
  });

  // Schedule midnight reminder (UK time)
  const midnightAt = ukTimeToNextLocalDate(0, 1);
  notifications.push({
    id: EOD_MIDNIGHT_ID,
    title: "🕛 Day Ended",
    body: "Any unlogged habits will be marked as missed. Open the app to check.",
    schedule: { at: midnightAt },
    sound: "default",
    extra: { url: "/" },
  });

  if (notifications.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications });
      console.log(`[nativeNotif] Scheduled ${notifications.length} daily notifications`);
    } catch (err) {
      console.error("[nativeNotif] Failed to schedule daily:", err);
    }
  }
}

// ─── Escalation Notifications ──────────────────────────────

/** Generate a stable numeric ID from a habit ID string */
function habitIdToNumber(habitId: string): number {
  let hash = 0;
  for (let i = 0; i < habitId.length; i++) {
    hash = (hash * 31 + habitId.charCodeAt(i)) & 0x3ff; // 10-bit hash (0-1023)
  }
  return hash;
}

export async function scheduleNativeEscalation(
  habitId: string,
  habitName: string,
  habitIcon: string,
): Promise<void> {
  const now = Date.now();
  const baseId = ESCALATION_ID_BASE + habitIdToNumber(habitId) * 10;

  const notifications = FIBONACCI_CUMULATIVE_MINS.map((cumMins, i) => {
    const fireAt = new Date(now + cumMins * 60 * 1000);
    const body = ESCALATION_MESSAGES[i].replace("[HABIT]", habitName);

    return {
      id: baseId + i,
      title: `${habitIcon} ${habitName}`,
      body,
      schedule: { at: fireAt },
      sound: "default",
      extra: { url: "/checkin", habitId },
    };
  });

  try {
    await LocalNotifications.schedule({ notifications });
    console.log(`[nativeNotif] Scheduled ${notifications.length} escalation notifications for "${habitName}"`);
  } catch (err) {
    console.error("[nativeNotif] Failed to schedule escalation:", err);
  }
}

export async function cancelNativeEscalation(habitId: string): Promise<void> {
  const baseId = ESCALATION_ID_BASE + habitIdToNumber(habitId) * 10;
  const ids = FIBONACCI_CUMULATIVE_MINS.map((_, i) => ({ id: baseId + i }));

  try {
    await LocalNotifications.cancel({ notifications: ids });
    console.log(`[nativeNotif] Cancelled escalation for habit ${habitId}`);
  } catch {
    // May fail if already fired — that's fine
  }
}

// ─── Reschedule All (call on app resume) ───────────────────

export async function rescheduleAllNativeNotifications(): Promise<void> {
  await scheduleNativeDailyNotifications();
}

// ─── Test Notification ─────────────────────────────────────

export async function sendNativeTestNotification(): Promise<void> {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 9999,
        title: "🔥 Test Notification",
        body: "Native notifications are working! Your accountability system is armed.",
        schedule: { at: new Date(Date.now() + 2000) }, // 2 seconds from now
        sound: "default",
      },
    ],
  });
}

// ─── Notification Tap Listener ─────────────────────────────

let listenersRegistered = false;

export function setupNativeNotificationListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  LocalNotifications.addListener(
    "localNotificationActionPerformed",
    (notification) => {
      const url = notification.notification?.extra?.url;
      if (url && typeof window !== "undefined") {
        // Use client-side navigation
        window.dispatchEvent(
          new CustomEvent("capacitor-notification-tap", { detail: { url } }),
        );
      }
    },
  );
}

// ─── App Resume Listener ───────────────────────────────────

let resumeListenerRegistered = false;

export function setupAppResumeListener(): void {
  if (resumeListenerRegistered) return;
  resumeListenerRegistered = true;

  App.addListener("appStateChange", async ({ isActive }) => {
    if (isActive) {
      console.log("[nativeNotif] App resumed — rescheduling notifications");
      await rescheduleAllNativeNotifications();
    }
  });
}

// ─── Cancel All ────────────────────────────────────────────

export async function cancelAllNativeNotifications(): Promise<void> {
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch {
    // Silent fail
  }
}
