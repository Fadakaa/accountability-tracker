// Habit CRUD — create, update, archive, restore, delete custom habits
// Default habits (from HABITS array in habits.ts) can only be archived/restored via overrides.
// Custom habits (stored in UserSettings.customHabits) support full CRUD.

import { loadSettings, saveSettings } from "./store";
import { HABITS } from "./habits";
import type { Habit, HabitCategory, HabitStack } from "@/types/database";

// Fallback user ID for offline/unauthenticated mode
const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─── Types ──────────────────────────────────────────────

export interface CreateHabitInput {
  name: string;
  icon: string;
  category: HabitCategory;
  stack: HabitStack;
  is_bare_minimum: boolean;
  unit: string | null; // "count", "minutes", "1-5", "1-10", or null for binary
}

// ─── CRUD Functions ─────────────────────────────────────

export function createHabit(input: CreateHabitInput, userId?: string): Habit {
  const settings = loadSettings();
  const customHabits = settings.customHabits ?? [];
  const id = crypto.randomUUID();
  const slug = generateSlug(input.name, customHabits);
  const now = new Date().toISOString();

  // Sort order: place at end of target stack
  const allInStack = [
    ...HABITS.filter((h) => h.stack === input.stack),
    ...customHabits.filter((h) => h.stack === input.stack && h.is_active),
  ];
  const maxOrder = allInStack.reduce(
    (max, h) => Math.max(max, h.sort_order),
    0
  );

  const habit: Habit = {
    id,
    user_id: userId ?? FALLBACK_USER_ID,
    name: input.name.trim(),
    slug,
    category: input.category,
    stack: input.stack,
    is_bare_minimum: input.is_bare_minimum,
    unit: input.unit,
    icon: input.icon || null,
    sort_order: maxOrder + 1,
    is_active: true,
    current_level: 1,
    created_at: now,
    updated_at: now,
  };

  settings.customHabits = [...customHabits, habit];
  saveSettings(settings);
  return habit;
}

export function updateCustomHabit(
  habitId: string,
  updates: Partial<
    Pick<Habit, "name" | "icon" | "stack" | "is_bare_minimum" | "unit">
  >
): void {
  const settings = loadSettings();
  const customHabits = settings.customHabits ?? [];
  const idx = customHabits.findIndex((h) => h.id === habitId);
  if (idx === -1) return; // not a custom habit

  const habit = customHabits[idx];
  const otherHabits = customHabits.filter((_, i) => i !== idx);

  settings.customHabits[idx] = {
    ...habit,
    ...updates,
    slug: updates.name
      ? generateSlug(updates.name, otherHabits)
      : habit.slug,
    updated_at: new Date().toISOString(),
  };
  saveSettings(settings);
}

export function archiveHabit(habitId: string): void {
  const settings = loadSettings();

  // For custom habits, also update the source object
  const customHabits = settings.customHabits ?? [];
  const customIdx = customHabits.findIndex((h) => h.id === habitId);
  if (customIdx !== -1) {
    settings.customHabits[customIdx] = {
      ...customHabits[customIdx],
      is_active: false,
      updated_at: new Date().toISOString(),
    };
  }

  // Set override for both default and custom (resolvedHabits reads this)
  settings.habitOverrides = {
    ...settings.habitOverrides,
    [habitId]: {
      ...settings.habitOverrides[habitId],
      is_active: false,
    },
  };

  saveSettings(settings);
}

export function restoreHabit(habitId: string): void {
  const settings = loadSettings();

  const customHabits = settings.customHabits ?? [];
  const customIdx = customHabits.findIndex((h) => h.id === habitId);
  if (customIdx !== -1) {
    settings.customHabits[customIdx] = {
      ...customHabits[customIdx],
      is_active: true,
      updated_at: new Date().toISOString(),
    };
  }

  settings.habitOverrides = {
    ...settings.habitOverrides,
    [habitId]: {
      ...settings.habitOverrides[habitId],
      is_active: true,
    },
  };

  saveSettings(settings);
}

export function deleteCustomHabit(habitId: string): void {
  // Only for custom habits — permanent removal
  if (isDefaultHabit(habitId)) return;

  const settings = loadSettings();
  settings.customHabits = (settings.customHabits ?? []).filter(
    (h) => h.id !== habitId
  );

  // Clean up overrides and level states
  const newOverrides = { ...settings.habitOverrides };
  delete newOverrides[habitId];
  settings.habitOverrides = newOverrides;

  const newLevelStates = { ...settings.levelUpStates };
  delete newLevelStates[habitId];
  settings.levelUpStates = newLevelStates;

  // Clean up from routine chains
  for (const stack of ["morning", "midday", "evening"] as HabitStack[]) {
    if (settings.routineChains[stack]) {
      settings.routineChains[stack] = settings.routineChains[stack].filter(
        (item) => item.habitId !== habitId
      );
    }
  }

  saveSettings(settings);
}

// ─── Helpers ────────────────────────────────────────────

const DEFAULT_HABIT_IDS = new Set(HABITS.map((h) => h.id));

export function isDefaultHabit(habitId: string): boolean {
  return DEFAULT_HABIT_IDS.has(habitId);
}

function generateSlug(name: string, existingCustomHabits: Habit[]): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);

  // Check against both default and custom habit slugs
  const allSlugs = new Set([
    ...HABITS.map((h) => h.slug),
    ...existingCustomHabits.map((h) => h.slug),
  ]);

  if (!allSlugs.has(base)) return base;

  let n = 2;
  while (allSlugs.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
