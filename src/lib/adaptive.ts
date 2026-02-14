// Adaptive bare minimum system — evaluates when to suggest level-ups or drop-backs
// Spec: 14 consecutive days at >85% completion → suggest level up
// Safety net: <50% for 7 days after level-up → suggest drop back

import { getResolvedHabits } from "./resolvedHabits";
import { loadState, saveState, loadSettings, saveSettings } from "./store";
import type { LocalState, UserSettings } from "./store";
import { HABIT_LEVELS, XP_VALUES } from "./habits";
import type { DayLog } from "./store";
import { isBinaryLike } from "@/types/database";
import type { Habit } from "@/types/database";

export interface LevelSuggestion {
  habitId: string;
  habitName: string;
  habitIcon: string;
  currentLevel: number;
  nextLevel: number;
  nextLevelLabel: string;
  type: "level_up" | "drop_back";
}

export function evaluateLevelSuggestions(
  stateArg?: LocalState,
  settingsArg?: UserSettings,
  habitsArg?: Habit[],
): LevelSuggestion[] {
  const state = stateArg ?? loadState();
  const settings = settingsArg ?? loadSettings();
  const habits = habitsArg ? getResolvedHabits(false, habitsArg, settings) : getResolvedHabits();
  const today = new Date().toISOString().slice(0, 10);
  const suggestions: LevelSuggestion[] = [];

  for (const habit of habits) {
    // Check both binary AND measured habits that have levels defined
    if (!habit.is_active) continue;
    if (!isBinaryLike(habit.category) && habit.category !== "measured") continue;
    const hasLevels = HABIT_LEVELS.some((hl) => hl.habit_id === habit.id);
    if (!hasLevels) continue;

    const levelState = settings.levelUpStates[habit.id];

    // Skip if declined recently
    if (levelState?.declinedUntil && levelState.declinedUntil > today) continue;

    // Calculate rate — binary uses status=done, measured uses value>0
    const isMeasured = habit.category === "measured";

    // LEVEL UP CHECK: >85% over last 14 days
    if (habit.current_level < 4) {
      const rate = calculateCompletionRate(habit.id, state.logs, 14, isMeasured);
      if (rate > 0.85) {
        const nextLevel = habit.current_level + 1;
        const nextDef = HABIT_LEVELS.find(
          (hl) => hl.habit_id === habit.id && hl.level === nextLevel
        );
        if (nextDef) {
          suggestions.push({
            habitId: habit.id,
            habitName: habit.name,
            habitIcon: habit.icon || "",
            currentLevel: habit.current_level,
            nextLevel,
            nextLevelLabel: nextDef.label,
            type: "level_up",
          });
        }
      }
    }

    // SAFETY NET: <50% over 7 days after level-up
    if (levelState?.levelUpDate && habit.current_level > 1) {
      const daysSince = daysBetween(levelState.levelUpDate, today);
      if (daysSince >= 7) {
        const recentRate = calculateCompletionRate(habit.id, state.logs, 7, isMeasured);
        if (recentRate < 0.5) {
          const prevLevel = levelState.previousLevel ?? habit.current_level - 1;
          const prevDef = HABIT_LEVELS.find(
            (hl) => hl.habit_id === habit.id && hl.level === prevLevel
          );
          if (prevDef) {
            suggestions.push({
              habitId: habit.id,
              habitName: habit.name,
              habitIcon: habit.icon || "",
              currentLevel: habit.current_level,
              nextLevel: prevLevel,
              nextLevelLabel: prevDef.label,
              type: "drop_back",
            });
          }
        }
      }
    }
  }

  return suggestions;
}

function calculateCompletionRate(
  habitId: string,
  logs: DayLog[],
  days: number,
  isMeasured: boolean = false
): number {
  const today = new Date();
  let completed = 0;
  let total = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const log = logs.find((l) => l.date === dateStr);
    total++;
    if (isMeasured) {
      // Measured habits: count as completed if a value > 0 was logged
      const entry = log?.entries[habitId];
      if (entry?.value && entry.value > 0) completed++;
    } else {
      // Binary habits: count as completed if status is "done"
      if (log?.entries[habitId]?.status === "done") completed++;
    }
  }

  return total > 0 ? completed / total : 0;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Accept a level-up. Returns updated { settings, state } for the caller to persist.
 * Also writes to localStorage as a fallback.
 */
export function acceptLevelUp(
  habitId: string,
  settingsArg?: UserSettings,
  stateArg?: LocalState,
  habitsArg?: Habit[],
): { settings: UserSettings; state: LocalState } {
  const settings = settingsArg ? { ...settingsArg } : loadSettings();
  const habits = habitsArg ? getResolvedHabits(false, habitsArg, settings) : getResolvedHabits();
  const habit = habits.find((h) => h.id === habitId);

  if (habit) {
    const today = new Date().toISOString().slice(0, 10);
    const newLevel = habit.current_level + 1;

    const existing = settings.habitOverrides[habitId] ?? {};
    settings.habitOverrides = {
      ...settings.habitOverrides,
      [habitId]: { ...existing, current_level: newLevel },
    };

    settings.levelUpStates = {
      ...settings.levelUpStates,
      [habitId]: {
        lastSuggestionDate: today,
        declinedUntil: null,
        levelUpDate: today,
        previousLevel: habit.current_level,
      },
    };
  }

  saveSettings(settings);

  const state = stateArg ? { ...stateArg } : loadState();
  state.totalXp += XP_VALUES.LEVEL_UP_ACCEPTED;
  state.currentLevel = getLevelForXPQuick(state.totalXp);
  saveState(state);

  return { settings, state };
}

/**
 * Decline a level-up. Returns updated settings for the caller to persist.
 */
export function declineLevelUp(
  habitId: string,
  settingsArg?: UserSettings,
): UserSettings {
  const settings = settingsArg ? { ...settingsArg } : loadSettings();
  const today = new Date();
  const askAgain = new Date(today);
  askAgain.setDate(askAgain.getDate() + 7);

  settings.levelUpStates = {
    ...settings.levelUpStates,
    [habitId]: {
      ...settings.levelUpStates[habitId],
      lastSuggestionDate: today.toISOString().slice(0, 10),
      declinedUntil: askAgain.toISOString().slice(0, 10),
      levelUpDate: settings.levelUpStates[habitId]?.levelUpDate ?? null,
      previousLevel: settings.levelUpStates[habitId]?.previousLevel ?? null,
    },
  };

  saveSettings(settings);
  return settings;
}

/**
 * Accept a drop-back. Returns updated settings for the caller to persist.
 */
export function acceptDropBack(
  habitId: string,
  settingsArg?: UserSettings,
): UserSettings {
  const settings = settingsArg ? { ...settingsArg } : loadSettings();
  const levelState = settings.levelUpStates[habitId];
  const prevLevel = levelState?.previousLevel ?? 1;

  const existing = settings.habitOverrides[habitId] ?? {};
  settings.habitOverrides = {
    ...settings.habitOverrides,
    [habitId]: { ...existing, current_level: prevLevel },
  };

  settings.levelUpStates = {
    ...settings.levelUpStates,
    [habitId]: {
      lastSuggestionDate: null,
      declinedUntil: null,
      levelUpDate: null,
      previousLevel: null,
    },
  };

  saveSettings(settings);
  return settings;
}

// Quick level lookup (avoids importing getLevelForXP to prevent circular deps)
function getLevelForXPQuick(xp: number): number {
  const thresholds = [0, 500, 1200, 2500, 4500, 7500, 11500, 17000, 24000, 33000, 45000, 60000, 80000, 105000, 140000];
  let lvl = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) { lvl = i + 1; break; }
  }
  return lvl;
}
