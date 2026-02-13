// One-time migration: uploads existing localStorage data to Supabase
// Runs on first authenticated app load when 'accountability-migrated' flag is absent.
// NEVER deletes localStorage data — it stays as an offline fallback.

import { supabase } from "@/lib/supabase";
import {
  loadState,
  loadSettings,
  loadGymSessions,
  loadGymRoutines,
  loadAllAdminTasks,
  loadShowingUpData,
} from "@/lib/store";
import { HABITS, HABIT_LEVELS } from "@/lib/habits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
import {
  dayLogToRows,
  gymSessionToRows,
  gymRoutineToRows,
  adminTaskToRow,
  showingUpToRow,
  sprintToRows,
  reflectionToRow,
} from "./transforms";

const MIGRATED_KEY = "accountability-migrated";

export function isMigrated(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MIGRATED_KEY) === "true";
}

function markMigrated(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(MIGRATED_KEY, "true");
  }
}

/** Check if Supabase already has habits for this user (i.e., they've been seeded before) */
async function hasExistingData(userId: string): Promise<boolean> {
  const { count } = await sb
    .from("habits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return (count ?? 0) > 0;
}

/**
 * Seed default habits for a new user.
 * Generates fresh UUIDs for each habit (avoids conflicts with any
 * pre-existing seed data from the SQL scripts).
 * Returns a mapping of old → new IDs so callers can remap references.
 */
async function seedHabitsForUser(userId: string): Promise<Record<string, string>> {
  console.log("[migration] Seeding habits for user", userId);

  // Always generate fresh UUIDs — avoids conflicts with seed data
  const idMap: Record<string, string> = {};
  const habitRows = HABITS.map((h) => {
    const newId = crypto.randomUUID();
    idMap[h.id] = newId;
    return {
      id: newId,
      user_id: userId,
      name: h.name,
      slug: h.slug,
      category: h.category,
      stack: h.stack,
      is_bare_minimum: h.is_bare_minimum,
      unit: h.unit,
      icon: h.icon,
      sort_order: h.sort_order,
      is_active: h.is_active,
      current_level: h.current_level,
    };
  });

  const { error: habitsError } = await sb.from("habits").insert(habitRows);
  if (habitsError) {
    console.error("[migration] Failed to seed habits:", habitsError);
    throw habitsError;
  }

  // Insert habit levels with remapped IDs
  const allLevelRows = HABIT_LEVELS.map((l) => ({
    habit_id: idMap[l.habit_id] ?? l.habit_id,
    level: l.level,
    label: l.label,
    description: l.description,
  }));

  if (allLevelRows.length > 0) {
    const { error: levelsError } = await sb.from("habit_levels").upsert(allLevelRows, {
      onConflict: "habit_id,level",
    });
    if (levelsError) {
      console.warn("[migration] Failed to seed habit levels:", levelsError);
    }
  }

  // Store mapping so we can remap daily_log habit references
  if (typeof window !== "undefined") {
    localStorage.setItem("accountability-habit-id-map", JSON.stringify(idMap));
  }

  console.log("[migration] Seeded", habitRows.length, "habits and", allLevelRows.length, "levels");
  return idMap;
}

/**
 * Migrate all localStorage data to Supabase.
 * Call once on first authenticated load.
 */
export async function migrateLocalStorageToSupabase(userId: string): Promise<void> {
  if (isMigrated()) {
    console.log("[migration] Already migrated, skipping");
    return;
  }

  console.log("[migration] Starting data migration to Supabase...");

  try {
    // 1. Seed habits if this user has none
    let idMap: Record<string, string> = {};
    const hasData = await hasExistingData(userId);
    if (!hasData) {
      idMap = await seedHabitsForUser(userId);
    } else {
      // Load existing ID mapping if we seeded before
      const stored = typeof window !== "undefined"
        ? localStorage.getItem("accountability-habit-id-map")
        : null;
      if (stored) idMap = JSON.parse(stored);
    }
    const remapId = (oldId: string) => idMap[oldId] ?? oldId;

    // 2. Migrate settings
    const settings = loadSettings();
    const { error: settingsError } = await sb.from("user_settings").upsert({
      user_id: userId,
      settings_json: settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (settingsError) console.warn("[migration] Settings error:", settingsError);

    // 3. Migrate custom habits (merge into habits table)
    if (settings.customHabits && settings.customHabits.length > 0) {
      const customRows = settings.customHabits.map((h) => ({
        id: remapId(h.id),
        user_id: userId,
        name: h.name,
        slug: h.slug,
        category: h.category,
        stack: h.stack,
        is_bare_minimum: h.is_bare_minimum,
        unit: h.unit,
        icon: h.icon,
        sort_order: h.sort_order,
        is_active: h.is_active,
        current_level: h.current_level,
      }));
      const { error } = await sb.from("habits").upsert(customRows, { onConflict: "id" });
      if (error) console.warn("[migration] Custom habits error:", error);
    }

    // 4. Apply habit overrides to the habits table
    if (settings.habitOverrides) {
      for (const [habitId, override] of Object.entries(settings.habitOverrides)) {
        const updates: Record<string, unknown> = {};
        if (override.stack !== undefined) updates.stack = override.stack;
        if (override.is_bare_minimum !== undefined) updates.is_bare_minimum = override.is_bare_minimum;
        if (override.is_active !== undefined) updates.is_active = override.is_active;
        if (override.current_level !== undefined) updates.current_level = override.current_level;
        if (override.sort_order !== undefined) updates.sort_order = override.sort_order;

        if (Object.keys(updates).length > 0) {
          await sb.from("habits").update(updates).eq("id", remapId(habitId)).eq("user_id", userId);
        }
      }
    }

    // 5. Migrate daily logs
    const state = loadState();
    if (state.logs.length > 0) {
      console.log("[migration] Migrating", state.logs.length, "day logs...");

      // Process in batches of 10 days to avoid overwhelming the API
      for (let i = 0; i < state.logs.length; i += 10) {
        const batch = state.logs.slice(i, i + 10);

        for (const dayLog of batch) {
          // Remap habit IDs in the dayLog before transforming
          const remappedLog = {
            ...dayLog,
            entries: Object.fromEntries(
              Object.entries(dayLog.entries).map(([hid, v]) => [remapId(hid), v])
            ),
            badEntries: Object.fromEntries(
              Object.entries(dayLog.badEntries).map(([hid, v]) => [remapId(hid), v])
            ),
          };
          const { dailyLogs, badHabitLogs, summary } = dayLogToRows(remappedLog, userId);

          if (dailyLogs.length > 0) {
            await sb.from("daily_logs").upsert(
              dailyLogs.map((r) => ({ ...r, id: crypto.randomUUID() })),
              { onConflict: "habit_id,log_date" }
            );
          }

          if (badHabitLogs.length > 0) {
            await sb.from("bad_habit_logs").upsert(
              badHabitLogs.map((r) => ({ ...r, id: crypto.randomUUID() })),
              { onConflict: "habit_id,log_date" }
            );
          }

          await sb.from("daily_log_summaries").upsert(
            { ...summary, id: crypto.randomUUID() },
            { onConflict: "user_id,log_date" }
          );
        }
      }
    }

    // 6. Migrate XP
    await sb.from("user_xp").upsert({
      user_id: userId,
      total_xp: state.totalXp,
      current_level: state.currentLevel,
    }, { onConflict: "user_id" });

    // 7. Migrate streaks
    for (const [slug, count] of Object.entries(state.streaks)) {
      // Find the habit ID for this slug
      const habit = HABITS.find((h) => h.slug === slug) ??
        settings.customHabits?.find((h) => h.slug === slug);
      if (!habit) continue;

      await sb.from("streaks").upsert({
        user_id: userId,
        habit_id: remapId(habit.id),
        current_count: count,
        longest_count: count, // Use current as longest (we don't track longest locally)
      }, { onConflict: "user_id,habit_id" });
    }

    // 8. Migrate bare minimum streak
    await sb.from("bare_minimum_streak").upsert({
      user_id: userId,
      current_count: state.bareMinimumStreak,
      longest_count: state.bareMinimumStreak,
    }, { onConflict: "user_id" });

    // 9. Migrate sprints
    if (state.activeSprint) {
      const { sprint, tasks } = sprintToRows(state.activeSprint, userId);
      await sb.from("sprints").upsert(sprint, { onConflict: "id" });
      if (tasks.length > 0) {
        await sb.from("sprint_tasks").upsert(tasks, { onConflict: "id" });
      }
    }
    for (const s of state.sprintHistory ?? []) {
      const { sprint, tasks } = sprintToRows(s, userId);
      await sb.from("sprints").upsert(sprint, { onConflict: "id" });
      if (tasks.length > 0) {
        await sb.from("sprint_tasks").upsert(tasks, { onConflict: "id" });
      }
    }

    // 10. Migrate reflections
    if (state.reflections && state.reflections.length > 0) {
      const rows = state.reflections.map((r) => reflectionToRow(r, userId));
      await sb.from("wrap_reflections").upsert(rows, { onConflict: "id" });
    }

    // 11. Migrate gym sessions
    const gymSessions = loadGymSessions();
    if (gymSessions.length > 0) {
      console.log("[migration] Migrating", gymSessions.length, "gym sessions...");
      for (const session of gymSessions) {
        const { session: sessionRow, exercises } = gymSessionToRows(session, userId);
        await sb.from("gym_sessions").upsert(sessionRow, { onConflict: "id" });
        for (const ex of exercises) {
          const { sets, ...exRow } = ex;
          await sb.from("gym_exercises").upsert(exRow, { onConflict: "id" });
          if (sets.length > 0) {
            await sb.from("gym_sets").upsert(sets, { onConflict: "id" });
          }
        }
      }
    }

    // 12. Migrate gym routines
    const gymRoutines = loadGymRoutines();
    if (gymRoutines.length > 0) {
      for (const routine of gymRoutines) {
        const { routine: routineRow, exercises } = gymRoutineToRows(routine, userId);
        await sb.from("gym_routines").upsert(routineRow, { onConflict: "id" });
        if (exercises.length > 0) {
          await sb.from("gym_routine_exercises").insert(exercises);
        }
      }
    }

    // 13. Migrate admin tasks
    const adminTasks = loadAllAdminTasks();
    if (adminTasks.length > 0) {
      console.log("[migration] Migrating", adminTasks.length, "admin tasks...");
      const rows = adminTasks.map((t) => adminTaskToRow(t, userId));
      await sb.from("admin_tasks").upsert(rows, { onConflict: "id" });
    }

    // 14. Migrate showing up data
    const showingUp = loadShowingUpData();
    if (showingUp.totalOpens > 0) {
      await sb.from("app_usage_stats").upsert({
        ...showingUpToRow(showingUp, userId),
      }, { onConflict: "user_id" });
    }

    // Mark as migrated
    markMigrated();
    console.log("[migration] ✅ Data migration complete!");
  } catch (err) {
    console.error("[migration] ❌ Migration failed:", err);
    // Don't mark as migrated — will retry next time
    throw err;
  }
}
