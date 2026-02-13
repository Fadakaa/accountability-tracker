// Merges static habit definitions with user overrides from settings
// All pages should use getResolvedHabits() instead of HABITS directly

import { HABITS } from "./habits";
import { loadSettings, loadState } from "./store";
import type { Habit, HabitStack } from "@/types/database";

/** Extended habit type that marks whether a habit has been retired (deactivated but has history) */
export interface ResolvedHabit extends Habit {
  isRetired: boolean;
  isDefault: boolean;
}

/**
 * Returns all habits with user overrides applied.
 * @param includeInactive - if true, includes deactivated habits (for analytics/historical views)
 */
export function getResolvedHabits(includeInactive = false): ResolvedHabit[] {
  const settings = loadSettings();
  const customHabits = settings.customHabits ?? [];

  // Merge static defaults + user-created custom habits
  const allSource: { habit: Habit; isDefault: boolean }[] = [
    ...HABITS.map((h) => ({ habit: h, isDefault: true })),
    ...customHabits.map((h) => ({ habit: h, isDefault: false })),
  ];

  const all = allSource.map(({ habit, isDefault }) => {
    const override = settings.habitOverrides[habit.id];
    const resolved: ResolvedHabit = {
      ...habit,
      stack: override?.stack ?? habit.stack,
      is_bare_minimum: override?.is_bare_minimum ?? habit.is_bare_minimum,
      is_active: override?.is_active ?? habit.is_active,
      current_level: override?.current_level ?? habit.current_level,
      sort_order: override?.sort_order ?? habit.sort_order,
      isRetired: false,
      isDefault,
    };
    // Mark as retired if it was deactivated
    if (!resolved.is_active) {
      resolved.isRetired = true;
    }
    return resolved;
  }).sort((a, b) => a.sort_order - b.sort_order);

  if (includeInactive) return all;
  return all.filter((h) => h.is_active);
}

export function getResolvedHabitsByStack(stack: HabitStack): ResolvedHabit[] {
  return getResolvedHabits().filter((h) => h.stack === stack && h.is_active);
}

/** Returns habits in the order defined by the routine chain (if set), falling back to sort_order */
export function getResolvedHabitsByChainOrder(stack: HabitStack): ResolvedHabit[] {
  const settings = loadSettings();
  const chain = settings.routineChains?.[stack] ?? [];
  const stackHabits = getResolvedHabitsByStack(stack);

  if (chain.length === 0) return stackHabits;

  // Build ordered list: chain order first, then any habits not in the chain
  const ordered: ResolvedHabit[] = [];
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

/** Returns all active habits PLUS any inactive habits that have historical log data.
 *  Use this in analytics/insights pages so deactivated habits still appear in charts.
 *  Retired habits are marked with isRetired: true for display purposes. */
export function getHabitsWithHistory(): ResolvedHabit[] {
  const all = getResolvedHabits(true); // get everything including inactive
  const active = all.filter((h) => h.is_active);
  const inactive = all.filter((h) => !h.is_active);

  if (inactive.length === 0) return active;

  // Scan logs for any inactive habit IDs
  const state = loadState();
  const loggedIds = new Set<string>();
  for (const log of state.logs) {
    for (const id of Object.keys(log.entries)) loggedIds.add(id);
    for (const id of Object.keys(log.badEntries)) loggedIds.add(id);
  }

  const inactiveWithHistory = inactive
    .filter((h) => loggedIds.has(h.id))
    .map((h) => ({ ...h, isRetired: true }));

  return [...active, ...inactiveWithHistory];
}
