// ─── Shared Schedule & Timing Service ──────────────────────
// Single source of truth for check-in schedule, current stack,
// next check-in time, and stack completion logic.
// ALL pages must use these functions instead of inline calculations.

import type { HabitStack } from "@/types/database";
import type { Habit } from "@/types/database";
import type { DayLog } from "./store";
import { loadSettings, getToday } from "./store";

// ─── Stack Boundaries ──────────────────────────────────────
// These define which hours belong to which stack.
// Centralised so changes propagate everywhere instantly.
export const STACK_BOUNDARIES = {
  MORNING_END: 12,   // morning stack: 00:00 - 11:59
  MIDDAY_END: 18,    // midday stack:  12:00 - 17:59
                      // evening stack: 18:00 - 23:59
} as const;

export const STACK_ORDER: HabitStack[] = ["morning", "midday", "evening"];

// ─── Current Stack ─────────────────────────────────────────
/** Returns which check-in stack we're in based on the current hour */
export function getCurrentStack(): HabitStack {
  const hour = new Date().getHours();
  if (hour < STACK_BOUNDARIES.MORNING_END) return "morning";
  if (hour < STACK_BOUNDARIES.MIDDAY_END) return "midday";
  return "evening";
}

// ─── Greeting ──────────────────────────────────────────────
export function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  if (hour < STACK_BOUNDARIES.MORNING_END) return name ? `Good morning ${name}` : "Good morning";
  if (hour < STACK_BOUNDARIES.MIDDAY_END) return "Afternoon check-in";
  return "Evening wrap-up";
}

export function getGreetingEmoji(): string {
  const hour = new Date().getHours();
  if (hour < STACK_BOUNDARIES.MORNING_END) return "🌅";
  if (hour < STACK_BOUNDARIES.MIDDAY_END) return "💪";
  return "🌙";
}

// ─── Check-in Times (from Settings) ────────────────────────
export interface CheckinSchedule {
  morning: string;  // "HH:MM"
  midday: string;
  evening: string;
}

/** Load check-in times from user settings — single source of truth */
export function getCheckinSchedule(): CheckinSchedule {
  const settings = loadSettings();
  return settings.checkinTimes;
}

// ─── Time Formatting ───────────────────────────────────────
/** Convert "HH:MM" (24h) to "H:MM AM/PM" (12h) */
export function formatTime24to12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Get current time as "HH:MM" */
export function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// ─── Next Check-in ─────────────────────────────────────────
/** Returns the next upcoming notification time as a formatted string.
 *  Uses ALL enabled notification slots (not just the 3 stack times)
 *  so the dashboard matches what the user configured in Settings. */
export function getNextCheckinDisplay(): string {
  const settings = loadSettings();
  const slots = (settings.notificationSlots ?? [])
    .filter((s: { enabled: boolean }) => s.enabled)
    .sort((a: { ukHour: number; ukMinute: number }, b: { ukHour: number; ukMinute: number }) =>
      a.ukHour * 60 + a.ukMinute - (b.ukHour * 60 + b.ukMinute)
    );

  if (slots.length === 0) return "";

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const slot of slots) {
    const slotMinutes = slot.ukHour * 60 + slot.ukMinute;
    if (slotMinutes > currentMinutes) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return formatTime24to12(`${pad(slot.ukHour)}:${pad(slot.ukMinute)}`);
    }
  }

  // All slots passed — show tomorrow's first slot
  const first = slots[0];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatTime24to12(`${pad(first.ukHour)}:${pad(first.ukMinute)}`)} tomorrow`;
}

// ─── Stack Completion ──────────────────────────────────────
/** Check if a stack's binary habits are all answered (done or missed) */
export function isStackComplete(
  stack: HabitStack,
  todayLog: DayLog | undefined,
  habits: Habit[]
): boolean {
  if (!todayLog) return false;
  const stackBinary = habits.filter(
    (h) => h.stack === stack && h.category === "binary" && h.is_active
  );
  if (stackBinary.length === 0) return false;
  return stackBinary.every((h) => {
    const entry = todayLog.entries[h.id];
    return entry && (entry.status === "done" || entry.status === "missed");
  });
}

/** Check if all three stacks are complete */
export function areAllStacksComplete(
  todayLog: DayLog | undefined,
  habits: Habit[]
): boolean {
  return STACK_ORDER.every((stack) => isStackComplete(stack, todayLog, habits));
}

/**
 * Check if a stack's binary habits have all been responded to (done, missed, OR later).
 * Different from isStackComplete which only counts done/missed.
 * Used by the check-in lock screen to detect if the user has already responded.
 */
export function isStackAnswered(
  stack: HabitStack,
  todayLog: DayLog | undefined,
  habits: Habit[]
): boolean {
  if (!todayLog) return false;
  const stackBinary = habits.filter(
    (h) => h.stack === stack && h.category === "binary" && h.is_active
  );
  if (stackBinary.length === 0) return false;
  return stackBinary.every((h) => {
    const entry = todayLog.entries[h.id];
    return entry && (entry.status === "done" || entry.status === "missed" || entry.status === "later");
  });
}

/** Check if all stacks have been responded to (including "later" responses) */
export function areAllStacksAnswered(
  todayLog: DayLog | undefined,
  habits: Habit[]
): boolean {
  return STACK_ORDER.every((stack) => isStackAnswered(stack, todayLog, habits));
}

/** Get stacks that come after the given stack */
export function getLaterStacks(currentStack: HabitStack): HabitStack[] {
  const idx = STACK_ORDER.indexOf(currentStack);
  return STACK_ORDER.slice(idx + 1);
}

// ─── Stack Labels ──────────────────────────────────────────
export function getStackLabel(stack: HabitStack): string {
  if (stack === "morning") return "Morning";
  if (stack === "midday") return "Afternoon";
  return "Evening";
}

export function getStackEmoji(stack: HabitStack): string {
  if (stack === "morning") return "🌅";
  if (stack === "midday") return "☀️";
  return "🌙";
}
