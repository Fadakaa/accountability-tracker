// Merges static habit definitions with user overrides from settings
// All pages should use getResolvedHabits() instead of HABITS directly
//
// When Supabase is connected, pass dbHabits from useDB() — the habits table
// already contains overrides and custom habits, so no merge is needed.
// When offline/unauthenticated, falls back to static HABITS + localStorage overrides.

import { HABITS } from "./habits";
import { loadSettings, loadState } from "./store";
import type { Habit, HabitStack } from "@/types/database";
import type { UserSettings } from "./store";

/** Extended habit type that marks whether a habit has been retired (deactivated but has history) */
export interface ResolvedHabit extends Habit {
  isRetired: boolean;
  isDefault: boolean;
}

/** Static default habit IDs for detecting which habits are "built-in" */
const DEFAULT_HABIT_IDS = new Set(HABITS.map((h) => h.id));

/**
 * Returns all habits with user overrides applied.
 * @param includeInactive - if true, includes deactivated habits (for analytics/historical views)
 * @param dbHabits - optional: habits fetched from Supabase (skips static merge when provided)
 * @param settingsOverride - optional: pre-loaded settings (avoids re-reading localStorage)
 */
export function getResolvedHabits(
  includeInactive = false,
  dbHabits?: Habit[] | null,
  settingsOverride?: UserSettings
): ResolvedHabit[] {
  // If we have DB habits, use them as a base but still apply local overrides
  // (the settings page writes overrides to habitOverrides which must be applied)
  if (dbHabits && dbHabits.length > 0) {
    const overrideSettings = settingsOverride ?? loadSettings();
    const overrides = overrideSettings.habitOverrides ?? {};

    const all = dbHabits.map((habit) => {
      const override = overrides[habit.id];
      const resolved: ResolvedHabit = {
        ...habit,
        stack: override?.stack ?? habit.stack,
        is_bare_minimum: override?.is_bare_minimum ?? habit.is_bare_minimum,
        is_active: override?.is_active ?? habit.is_active,
        current_level: override?.current_level ?? habit.current_level,
        sort_order: override?.sort_order ?? habit.sort_order,
        isRetired: false,
        isDefault: DEFAULT_HABIT_IDS.has(habit.id),
      };
      if (!resolved.is_active) resolved.isRetired = true;
      return resolved;
    }).sort((a, b) => a.sort_order - b.sort_order);

    // Also include custom habits from settings that aren't in DB yet
    const dbIds = new Set(dbHabits.map((h) => h.id));
    const customHabits = overrideSettings.customHabits ?? [];
    for (const ch of customHabits) {
      if (!dbIds.has(ch.id)) {
        const override = overrides[ch.id];
        all.push({
          ...ch,
          stack: override?.stack ?? ch.stack,
          is_bare_minimum: override?.is_bare_minimum ?? ch.is_bare_minimum,
          is_active: override?.is_active ?? ch.is_active,
          current_level: override?.current_level ?? ch.current_level,
          sort_order: override?.sort_order ?? ch.sort_order,
          isRetired: !(override?.is_active ?? ch.is_active),
          isDefault: false,
        } as ResolvedHabit);
      }
    }
    all.sort((a, b) => a.sort_order - b.sort_order);

    if (includeInactive) return all;
    return all.filter((h) => h.is_active);
  }

  // Fallback: merge static HABITS + localStorage overrides (offline mode)
  const settings = settingsOverride ?? loadSettings();
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

export function getResolvedHabitsByStack(
  stack: HabitStack,
  dbHabits?: Habit[] | null,
  settingsOverride?: UserSettings
): ResolvedHabit[] {
  return getResolvedHabits(false, dbHabits, settingsOverride)
    .filter((h) => h.stack === stack && h.is_active);
}

/** Returns habits in the order defined by the routine chain (if set), falling back to sort_order */
export function getResolvedHabitsByChainOrder(
  stack: HabitStack,
  dbHabits?: Habit[] | null,
  settingsOverride?: UserSettings
): ResolvedHabit[] {
  const settings = settingsOverride ?? loadSettings();
  const chain = settings.routineChains?.[stack] ?? [];
  const stackHabits = getResolvedHabitsByStack(stack, dbHabits, settingsOverride);

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
export function getHabitsWithHistory(
  dbHabits?: Habit[] | null,
  logs?: { entries: Record<string, unknown>; badEntries: Record<string, unknown> }[]
): ResolvedHabit[] {
  const all = getResolvedHabits(true, dbHabits); // get everything including inactive
  const active = all.filter((h) => h.is_active);
  const inactive = all.filter((h) => !h.is_active);

  if (inactive.length === 0) return active;

  // Scan logs for any inactive habit IDs
  const logData = logs ?? loadState().logs;
  const loggedIds = new Set<string>();
  for (const log of logData) {
    for (const id of Object.keys(log.entries)) loggedIds.add(id);
    for (const id of Object.keys(log.badEntries)) loggedIds.add(id);
  }

  const inactiveWithHistory = inactive
    .filter((h) => loggedIds.has(h.id))
    .map((h) => ({ ...h, isRetired: true }));

  return [...active, ...inactiveWithHistory];
}
