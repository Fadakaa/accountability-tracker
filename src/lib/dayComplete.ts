// Day completion detection — checks if ALL habits for the day are logged

import type { LocalState, DayLog } from "./store";
import { getTodayLog } from "./store";
import { getResolvedHabits } from "./resolvedHabits";

/** Check if every active habit has been answered today */
export function isDayFullyComplete(state: LocalState): boolean {
  const todayLog = getTodayLog(state);
  if (!todayLog) return false;

  const activeHabits = getResolvedHabits().filter((h) => h.is_active);

  // All binary habits must be answered (done or missed — not unanswered)
  const binaryHabits = activeHabits.filter((h) => h.category === "binary");
  const allBinaryAnswered = binaryHabits.every((h) => {
    const entry = todayLog.entries[h.id];
    return entry && (entry.status === "done" || entry.status === "missed");
  });
  if (!allBinaryAnswered) return false;

  // All measured habits must have a value logged
  const measuredHabits = activeHabits.filter((h) => h.category === "measured");
  const allMeasuredLogged = measuredHabits.every((h) => {
    const entry = todayLog.entries[h.id];
    return entry && entry.value !== null && entry.value !== undefined;
  });
  if (!allMeasuredLogged) return false;

  // All bad habits must be logged
  const badHabits = activeHabits.filter((h) => h.category === "bad");
  const allBadLogged = badHabits.every((h) => {
    const entry = todayLog.badEntries[h.id];
    return entry && entry.occurred !== undefined && entry.occurred !== null;
  });
  if (!allBadLogged) return false;

  return true;
}

/** Check if the day was perfect — all binary done, no bad habits, bare minimum met */
export function isDayPerfect(state: LocalState): boolean {
  const todayLog = getTodayLog(state);
  if (!todayLog) return false;
  if (!todayLog.bareMinimumMet) return false;

  const activeHabits = getResolvedHabits().filter((h) => h.is_active);

  // All binary = done (not just answered)
  const binaryHabits = activeHabits.filter((h) => h.category === "binary");
  const allDone = binaryHabits.every((h) => todayLog.entries[h.id]?.status === "done");
  if (!allDone) return false;

  // No bad habits occurred
  const badHabits = activeHabits.filter((h) => h.category === "bad");
  const allClean = badHabits.every((h) => todayLog.badEntries[h.id]?.occurred === false);
  if (!allClean) return false;

  return true;
}

/** Get stats for the day complete screen */
export function getDayStats(state: LocalState): {
  habitsCompleted: number;
  habitsTotal: number;
  xpEarned: number;
  bareMinimumMet: boolean;
  isPerfect: boolean;
} {
  const todayLog = getTodayLog(state);
  const activeHabits = getResolvedHabits().filter((h) => h.is_active);
  const binaryHabits = activeHabits.filter((h) => h.category === "binary");

  const habitsCompleted = binaryHabits.filter((h) =>
    todayLog?.entries[h.id]?.status === "done"
  ).length;

  return {
    habitsCompleted,
    habitsTotal: binaryHabits.length,
    xpEarned: todayLog?.xpEarned ?? 0,
    bareMinimumMet: todayLog?.bareMinimumMet ?? false,
    isPerfect: isDayPerfect(state),
  };
}
