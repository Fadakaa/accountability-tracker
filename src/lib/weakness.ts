// Weakness detection — identifies habits with low completion rates
// Surfaces habits that need more attention on dashboard and check-in

import { getResolvedHabits } from "./resolvedHabits";
import { loadState } from "./store";
import { isBinaryLike } from "@/types/database";

export interface WeakHabit {
  habitId: string;
  habitName: string;
  habitIcon: string;
  completionRate: number; // 0-1
  currentStreak: number;
  isBrokenStreak: boolean; // had a streak that was recently broken
  daysMissed: number; // out of the window
}

export function getWeakHabits(windowDays: number = 7): WeakHabit[] {
  const state = loadState();
  const habits = getResolvedHabits();
  const today = new Date();
  const weakHabits: WeakHabit[] = [];

  for (const habit of habits) {
    // Only check active binary habits
    if (!habit.is_active || !isBinaryLike(habit.category)) continue;

    let completed = 0;
    let total = 0;

    for (let i = 0; i < windowDays; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const log = state.logs.find((l) => l.date === dateStr);
      total++;
      if (log?.entries[habit.id]?.status === "done") completed++;
    }

    const rate = total > 0 ? completed / total : 0;
    const currentStreak = state.streaks[habit.slug] ?? 0;

    // Detect broken streak: streak is 0 but habit was done at some point
    const hadHistory = state.logs.some(
      (l) => l.entries[habit.id]?.status === "done"
    );
    const isBrokenStreak = currentStreak === 0 && hadHistory;

    // Below 50% = needs attention
    if (rate < 0.5) {
      weakHabits.push({
        habitId: habit.id,
        habitName: habit.name,
        habitIcon: habit.icon || "",
        completionRate: rate,
        currentStreak,
        isBrokenStreak,
        daysMissed: total - completed,
      });
    }
  }

  // Worst first
  return weakHabits.sort((a, b) => a.completionRate - b.completionRate);
}

// Quick check if a specific habit is weak (for check-in highlighting)
export function isHabitWeak(habitId: string): boolean {
  const weakHabits = getWeakHabits();
  return weakHabits.some((wh) => wh.habitId === habitId);
}
