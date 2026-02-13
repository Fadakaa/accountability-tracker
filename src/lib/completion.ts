// ─── Shared Completion & Stats Service ─────────────────────
// Single source of truth for completion rates, done counts,
// and bad habit statistics. All pages use these instead of
// inline counting loops.

import type { DayLog } from "./store";
import type { Habit } from "@/types/database";

// ─── Done Counting ─────────────────────────────────────────

/** Count how many days a habit was "done" across a set of logs */
export function countDone(habitId: string, logs: DayLog[]): number {
  let count = 0;
  for (const log of logs) {
    if (log.entries[habitId]?.status === "done") count++;
  }
  return count;
}

/** Get completion rate (0-1) for a habit over a set of logs */
export function getCompletionRate(habitId: string, logs: DayLog[], totalDays: number): number {
  if (totalDays === 0) return 0;
  return countDone(habitId, logs) / totalDays;
}

// ─── Daily Completion Stats ────────────────────────────────

export interface DailyCompletionStats {
  bareMinDone: number;
  bareMinTotal: number;
  stretchDone: number;
  stretchTotal: number;
  measuredDone: number;
  measuredTotal: number;
}

/** Calculate completion stats for today from a log entry and habit list */
export function getDailyCompletionStats(
  todayLog: DayLog | undefined,
  habits: Habit[]
): DailyCompletionStats {
  const bareMinHabits = habits.filter((h) => h.is_bare_minimum && h.is_active);
  const stretchHabits = habits.filter((h) => h.category === "binary" && !h.is_bare_minimum && h.is_active);
  const measuredHabits = habits.filter((h) => h.category === "measured" && h.is_active);

  let bareMinDone = 0;
  let stretchDone = 0;
  let measuredDone = 0;

  if (todayLog) {
    for (const h of bareMinHabits) {
      if (todayLog.entries[h.id]?.status === "done") bareMinDone++;
    }
    for (const h of stretchHabits) {
      if (todayLog.entries[h.id]?.status === "done") stretchDone++;
    }
    for (const h of measuredHabits) {
      if (todayLog.entries[h.id]?.value && todayLog.entries[h.id].value! > 0) measuredDone++;
    }
  }

  return {
    bareMinDone,
    bareMinTotal: bareMinHabits.length,
    stretchDone,
    stretchTotal: stretchHabits.length,
    measuredDone,
    measuredTotal: measuredHabits.length,
  };
}

// ─── Bad Habit Stats ───────────────────────────────────────

export interface BadHabitWeekStats {
  slug: string;
  icon: string;
  label: string;
  unit: string | null;
  count: number;
  minutes: number;
}

/** Get bad habit occurrence stats from a set of logs */
export function getBadHabitStats(
  badHabits: Habit[],
  logs: DayLog[]
): BadHabitWeekStats[] {
  return badHabits.map((h) => {
    let count = 0;
    let minutes = 0;
    for (const log of logs) {
      const entry = log.badEntries[h.id];
      if (entry?.occurred) {
        count++;
        minutes += entry.durationMinutes ?? 0;
      }
    }
    return {
      slug: h.slug,
      icon: h.icon || "⚠️",
      label: h.name,
      unit: h.unit,
      count,
      minutes,
    };
  });
}

/** Format bad habit display value */
export function formatBadHabitDisplay(unit: string | null, count: number, minutes: number): string {
  if (unit === "minutes") {
    const hrs = minutes / 60;
    return hrs >= 1 ? `${hrs.toFixed(1)}h` : `${minutes}m`;
  }
  return `${count} days`;
}

// ─── Week Logs Helper ──────────────────────────────────────

/** Get logs for the current week (Sunday-based) */
export function getWeekLogsFromArray(logs: DayLog[]): DayLog[] {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  return logs.filter((l) => l.date >= weekStartStr);
}
