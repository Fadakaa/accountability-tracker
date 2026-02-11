// Merges static habit definitions with user overrides from settings
// All pages should use getResolvedHabits() instead of HABITS directly

import { HABITS } from "./habits";
import { loadSettings } from "./store";
import type { Habit, HabitStack } from "@/types/database";

export function getResolvedHabits(): Habit[] {
  const settings = loadSettings();
  return HABITS.map((habit) => {
    const override = settings.habitOverrides[habit.id];
    if (!override) return habit;
    return {
      ...habit,
      stack: override.stack ?? habit.stack,
      is_bare_minimum: override.is_bare_minimum ?? habit.is_bare_minimum,
      is_active: override.is_active ?? habit.is_active,
      current_level: override.current_level ?? habit.current_level,
      sort_order: override.sort_order ?? habit.sort_order,
    };
  }).sort((a, b) => a.sort_order - b.sort_order);
}

export function getResolvedHabitsByStack(stack: HabitStack): Habit[] {
  return getResolvedHabits().filter((h) => h.stack === stack && h.is_active);
}

/** Returns habits in the order defined by the routine chain (if set), falling back to sort_order */
export function getResolvedHabitsByChainOrder(stack: HabitStack): Habit[] {
  const settings = loadSettings();
  const chain = settings.routineChains?.[stack] ?? [];
  const stackHabits = getResolvedHabitsByStack(stack);

  if (chain.length === 0) return stackHabits;

  // Build ordered list: chain order first, then any habits not in the chain
  const ordered: Habit[] = [];
  const seen = new Set<string>();

  for (const item of chain) {
    if (item.type === "habit" && item.habitId) {
      const habit = stackHabits.find((h) => h.id === item.habitId);
      if (habit) {
        ordered.push(habit);
        seen.add(habit.id);
      }
    }
  }

  // Add any active habits not in the chain
  for (const habit of stackHabits) {
    if (!seen.has(habit.id)) {
      ordered.push(habit);
    }
  }

  return ordered;
}
