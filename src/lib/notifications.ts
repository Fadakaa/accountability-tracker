// ─── Browser Push Notification System ────────────────────────
// Handles: permission, 3x daily check-ins, Fibonacci escalation,
// 11PM warning, midnight auto-miss

import { getRandomQuote } from "./habits";
import { loadState, saveState, getToday, loadSettings } from "./store";
import { getResolvedHabits } from "./resolvedHabits";
import type { HabitStack } from "@/types/database";

// ─── Types ──────────────────────────────────────────────────
export interface EscalationTimer {
  habitId: string;
  habitName: string;
  habitIcon: string;
  startedAt: number;       // timestamp ms
  step: number;            // current escalation step (0-5+)
  nextAt: number;          // timestamp ms of next notification
  resolved: boolean;
}

export interface NotificationState {
  permissionGranted: boolean;
  escalations: EscalationTimer[];
  lastCheckinDate: Record<HabitStack, string>;  // stack -> date string
  scheduledCheckins: { stack: HabitStack; time: string }[];
  last11pmWarning?: string;   // date string to prevent double-fire
  lastMidnightMiss?: string;  // date string to prevent double-fire
}

const NOTIF_STORAGE_KEY = "accountability-notifications";

// ─── Fibonacci escalation intervals (ms) from spec ──────────
// +13 min → +8 min → +5 min → +3 min → +1 min → every 1 min
const FIBONACCI_INTERVALS_MS = [
  13 * 60 * 1000,  // Step 0: +13 min — Gentle
  8 * 60 * 1000,   // Step 1: +8 min  — Nudge
  5 * 60 * 1000,   // Step 2: +5 min  — Firm
  3 * 60 * 1000,   // Step 3: +3 min  — Urgent
  1 * 60 * 1000,   // Step 4: +1 min  — Final
  1 * 60 * 1000,   // Step 5+: every 1 min — Relentless
];

const ESCALATION_MESSAGES = [
  { prefix: "",   template: "Just checking — did you get to [HABIT] yet?" },
  { prefix: "",   template: "Still pending: [HABIT]. Small actions, ruthless consistency." },
  { prefix: "⚠️", template: "[HABIT] is still open. Even 30 seconds counts." },
  { prefix: "🔴", template: "[HABIT] — do it now. Relief later." },
  { prefix: "",   template: "Last call: [HABIT]. Yes or No. No more later." },
  { prefix: "🚨", template: "[HABIT] — I don't negotiate with the plan. I execute it." },
];

const CHECKIN_MESSAGES: Record<HabitStack, { title: string; body: string }> = {
  morning: {
    title: "Morning check-in 🌅",
    body: "How's the morning routine going? Quick update 👇",
  },
  midday: {
    title: "Afternoon check-in ☀️",
    body: "Afternoon check — how's the grind? 💪",
  },
  evening: {
    title: "Evening wrap-up 🌙",
    body: "End of day — let's close it out 🌙",
  },
};

// ─── Auto-miss timeout: 30 min total from first "Later" ─────
const AUTO_MISS_TIMEOUT_MS = 30 * 60 * 1000;

// ─── Permission ─────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const result = await Notification.requestPermission();
  if (result === "granted") {
    // Subscribe to push when permission is granted
    subscribeToPush().catch(() => {});
  }
  return result === "granted";
}

// ─── Web Push Subscription ──────────────────────────────────
const PUSH_SUB_KEY = "accountability-push-subscription";

export async function subscribeToPush(): Promise<PushSubscription | null> {
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (!registration) return null;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return null;

    // Convert VAPID key to ArrayBuffer for pushManager.subscribe
    const urlBase64ToArrayBuffer = (base64String: string): ArrayBuffer => {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = atob(base64);
      const buffer = new ArrayBuffer(rawData.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < rawData.length; i++) {
        view[i] = rawData.charCodeAt(i);
      }
      return buffer;
    };

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });
    }

    // Store locally as backup
    localStorage.setItem(PUSH_SUB_KEY, JSON.stringify(subscription.toJSON()));

    // Register with server
    const settings = loadSettings();
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        checkinTimes: settings.checkinTimes,
      }),
    }).catch(() => {}); // don't block on network failure

    return subscription;
  } catch {
    return null;
  }
}

export function getStoredPushSubscription(): PushSubscriptionJSON | null {
  try {
    const raw = localStorage.getItem(PUSH_SUB_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Send a push notification via the server (for background delivery) */
export async function sendServerPush(
  title: string,
  body: string,
  tag?: string,
  url?: string
): Promise<boolean> {
  const subscription = getStoredPushSubscription();
  if (!subscription) return false;

  try {
    const response = await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        title,
        body,
        tag,
        url,
      }),
    });

    if (response.status === 410) {
      // Subscription expired — re-subscribe
      localStorage.removeItem(PUSH_SUB_KEY);
      subscribeToPush().catch(() => {});
      return false;
    }

    return response.ok;
  } catch {
    return false;
  }
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// ─── State ──────────────────────────────────────────────────
export function loadNotifState(): NotificationState {
  if (typeof window === "undefined") {
    return { permissionGranted: false, escalations: [], lastCheckinDate: {} as Record<HabitStack, string>, scheduledCheckins: [] };
  }
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return getDefaultNotifState();
    return JSON.parse(raw) as NotificationState;
  } catch {
    return getDefaultNotifState();
  }
}

export function saveNotifState(state: NotificationState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(state));
}

function getDefaultNotifState(): NotificationState {
  const settings = loadSettings();
  return {
    permissionGranted: false,
    escalations: [],
    lastCheckinDate: {} as Record<HabitStack, string>,
    scheduledCheckins: [
      { stack: "morning", time: settings.checkinTimes.morning },
      { stack: "midday", time: settings.checkinTimes.midday },
      { stack: "evening", time: settings.checkinTimes.evening },
    ],
  };
}

// ─── Show a notification via the service worker ─────────────
export async function showNotification(
  title: string,
  body: string,
  tag?: string,
  url?: string
): Promise<void> {
  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker?.ready;
  if (registration) {
    await registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      tag: tag || "accountability",
      data: { url: url || "/checkin" },
    });
  }
}

// ─── Schedule the 3x daily check-in notifications ───────────
// Uses setInterval to check every minute if it's time
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationScheduler(): void {
  if (schedulerInterval) return; // already running

  // Check every 60 seconds
  schedulerInterval = setInterval(() => {
    tickScheduler();
    tickEscalations();
    tickEndOfDay();
  }, 60 * 1000);

  // Also run immediately
  tickScheduler();
  tickEscalations();
}

export function stopNotificationScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

function tickScheduler(): void {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = getToday();
  const notifState = loadNotifState();

  for (const checkin of notifState.scheduledCheckins) {
    // Only fire if time matches AND we haven't already fired for this stack today
    if (currentTime === checkin.time && notifState.lastCheckinDate[checkin.stack] !== today) {
      const msg = CHECKIN_MESSAGES[checkin.stack];
      showNotification(msg.title, msg.body, `checkin-${checkin.stack}`, "/checkin");
      // Also try server-side push for background delivery
      sendServerPush(msg.title, msg.body, `checkin-${checkin.stack}`, "/checkin").catch(() => {});
      notifState.lastCheckinDate[checkin.stack] = today;
      saveNotifState(notifState);
    }
  }
}

// ─── Fibonacci Escalation Engine ────────────────────────────

export function startEscalation(habitId: string, habitName: string, habitIcon: string): void {
  const notifState = loadNotifState();

  // Don't double-escalate
  if (notifState.escalations.some((e) => e.habitId === habitId && !e.resolved)) return;

  const now = Date.now();
  const firstInterval = FIBONACCI_INTERVALS_MS[0];

  notifState.escalations.push({
    habitId,
    habitName,
    habitIcon,
    startedAt: now,
    step: 0,
    nextAt: now + firstInterval,
    resolved: false,
  });

  saveNotifState(notifState);
}

export function resolveEscalation(habitId: string): void {
  const notifState = loadNotifState();
  for (const esc of notifState.escalations) {
    if (esc.habitId === habitId && !esc.resolved) {
      esc.resolved = true;
    }
  }
  saveNotifState(notifState);
}

export function resolveAllEscalations(): void {
  const notifState = loadNotifState();
  for (const esc of notifState.escalations) {
    esc.resolved = true;
  }
  saveNotifState(notifState);
}

function tickEscalations(): void {
  const notifState = loadNotifState();
  const now = Date.now();
  let changed = false;

  for (const esc of notifState.escalations) {
    if (esc.resolved) continue;

    // Auto-miss after 30 minutes total
    if (now - esc.startedAt >= AUTO_MISS_TIMEOUT_MS) {
      esc.resolved = true;
      changed = true;

      // Auto-log as missed
      autoMissHabit(esc.habitId);

      showNotification(
        `${esc.habitIcon} ${esc.habitName} — Auto-missed`,
        "No response after 30 minutes. Logged as missed.",
        `escalation-miss-${esc.habitId}`
      );
      continue;
    }

    // Time to send next escalation?
    if (now >= esc.nextAt) {
      const stepIndex = Math.min(esc.step, ESCALATION_MESSAGES.length - 1);
      const msg = ESCALATION_MESSAGES[stepIndex];
      const body = msg.template.replace("[HABIT]", esc.habitName);
      const quote = getRandomQuote();

      showNotification(
        `${msg.prefix} ${esc.habitIcon} ${esc.habitName}`.trim(),
        `${body}\n\n"${quote}"`,
        `escalation-${esc.habitId}-${esc.step}`,
        "/checkin"
      );

      // Advance to next step
      esc.step++;
      const nextInterval = FIBONACCI_INTERVALS_MS[Math.min(esc.step, FIBONACCI_INTERVALS_MS.length - 1)];
      esc.nextAt = now + nextInterval;
      changed = true;
    }
  }

  if (changed) {
    saveNotifState(notifState);
  }
}

function autoMissHabit(habitId: string): void {
  const state = loadState();
  const today = getToday();
  const todayLog = state.logs.find((l) => l.date === today);

  if (todayLog) {
    todayLog.entries[habitId] = { status: "missed", value: null };
  } else {
    state.logs.push({
      date: today,
      entries: { [habitId]: { status: "missed", value: null } },
      badEntries: {},
      xpEarned: 0,
      bareMinimumMet: false,
      submittedAt: new Date().toISOString(),
    });
  }

  // Break streak
  const habit = getResolvedHabits().find((h) => h.id === habitId);
  if (habit) {
    state.streaks[habit.slug] = 0;
  }

  saveState(state);
}

// ─── End of Day: 11PM warning + midnight auto-miss ──────────
function tickEndOfDay(): void {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const today = getToday();
  const state = loadState();
  const todayLog = state.logs.find((l) => l.date === today);

  // 11:00 PM warning — if day isn't fully logged (range check: 23:00-23:01)
  const notifState11 = loadNotifState();
  if (hour === 23 && minute <= 1 && notifState11.last11pmWarning !== today) {
    const allBinaryHabits = getResolvedHabits().filter((h) => h.category === "binary" && h.is_active);
    const loggedCount = allBinaryHabits.filter(
      (h) => todayLog?.entries[h.id]?.status === "done" || todayLog?.entries[h.id]?.status === "missed"
    ).length;

    if (loggedCount < allBinaryHabits.length) {
      const remaining = allBinaryHabits.length - loggedCount;
      showNotification(
        "⚠️ Day isn't logged yet",
        `${remaining} habits still unlogged. Don't let the day slip.`,
        "end-of-day-warning",
        "/checkin"
      );
    }
    notifState11.last11pmWarning = today;
    saveNotifState(notifState11);
  }

  // Midnight — auto-mark all unlogged as missed (range check: 00:00-00:01)
  const notifStateMid = loadNotifState();
  const yesterdayForCheck = new Date(now);
  yesterdayForCheck.setDate(yesterdayForCheck.getDate() - 1);
  const yesterdayCheckStr = yesterdayForCheck.toISOString().slice(0, 10);
  if (hour === 0 && minute <= 1 && notifStateMid.lastMidnightMiss !== yesterdayCheckStr) {
    const yesterdayLog = state.logs.find((l) => l.date === yesterdayCheckStr);

    const allHabits = getResolvedHabits().filter((h) => h.category === "binary" && h.is_active);
    let missedCount = 0;

    for (const habit of allHabits) {
      const entry = yesterdayLog?.entries[habit.id];
      if (!entry || (entry.status !== "done" && entry.status !== "missed")) {
        // Auto-miss
        if (yesterdayLog) {
          yesterdayLog.entries[habit.id] = { status: "missed", value: null };
        }
        state.streaks[habit.slug] = 0;
        missedCount++;
      }
    }

    // Also auto-miss bad habits (if not logged, assume clean — no penalty)
    // Bad habits that weren't logged = assumed not to have occurred

    if (missedCount > 0) {
      if (!yesterdayLog) {
        state.logs.push({
          date: yesterdayCheckStr,
          entries: Object.fromEntries(
            allHabits.map((h) => [h.id, { status: "missed" as const, value: null }])
          ),
          badEntries: {},
          xpEarned: 0,
          bareMinimumMet: false,
          submittedAt: new Date().toISOString(),
        });
      }

      saveState(state);

      showNotification(
        "Yesterday wasn't logged",
        `${missedCount} habits marked as missed. Today's a new day — let's go.`,
        "midnight-auto-miss",
        "/checkin"
      );
    }
    notifStateMid.lastMidnightMiss = yesterdayCheckStr;
    saveNotifState(notifStateMid);
  }
}

// ─── Pending "Later" count ──────────────────────────────────
export function getPendingEscalationCount(): number {
  const notifState = loadNotifState();
  return notifState.escalations.filter((e) => !e.resolved).length;
}

// ─── Sprint Mode adjustments ────────────────────────────────
export function getSprintAdjustedFibonacci(intensity: "moderate" | "intense" | "critical"): number[] {
  if (intensity === "moderate") {
    // Start at 21 min instead of 13
    return [
      21 * 60 * 1000,
      13 * 60 * 1000,
      8 * 60 * 1000,
      5 * 60 * 1000,
      3 * 60 * 1000,
      1 * 60 * 1000,
    ];
  }
  // Intense + Critical use normal intervals
  return FIBONACCI_INTERVALS_MS;
}
