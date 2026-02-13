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

// ─── Progress callback for on-screen logging ────────────

export interface MigrationStep {
  step: string;
  status: "running" | "done" | "error" | "skipped";
  detail?: string;
}

export type MigrationProgressCallback = (steps: MigrationStep[]) => void;

// ─── Helpers ────────────────────────────────────────────

export function isMigrated(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MIGRATED_KEY) === "true";
}

function markMigrated(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(MIGRATED_KEY, "true");
  }
}

/** Check if Supabase already has habits for this user */
async function hasExistingData(userId: string): Promise<boolean> {
  const { count, error } = await sb
    .from("habits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`hasExistingData: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * Seed default habits for a new user.
 * Generates fresh UUIDs for each habit.
 * Returns a mapping of old → new IDs.
 */
async function seedHabitsForUser(userId: string): Promise<Record<string, string>> {
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
    throw new Error(`Seed habits: ${habitsError.message} (code: ${habitsError.code}, details: ${habitsError.details})`);
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
      // Non-fatal — habits were created, just levels failed
      console.warn("[migration] Habit levels warning:", levelsError);
    }
  }

  // Store mapping for ID remapping
  if (typeof window !== "undefined") {
    localStorage.setItem("accountability-habit-id-map", JSON.stringify(idMap));
  }

  return idMap;
}

/**
 * Migrate all localStorage data to Supabase.
 * Accepts an optional progress callback for on-screen logging.
 */
export async function migrateLocalStorageToSupabase(
  userId: string,
  onProgress?: MigrationProgressCallback,
): Promise<void> {
  if (isMigrated()) {
    onProgress?.([{ step: "Migration", status: "skipped", detail: "Already migrated" }]);
    return;
  }

  const steps: MigrationStep[] = [];
  function report(step: string, status: MigrationStep["status"], detail?: string) {
    const existing = steps.find((s) => s.step === step);
    if (existing) {
      existing.status = status;
      existing.detail = detail;
    } else {
      steps.push({ step, status, detail });
    }
    onProgress?.([...steps]);
  }

  try {
    // ── Step 0: Verify auth session ─────────────────────
    report("Check auth session", "running");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      report("Check auth session", "error", `Auth error: ${sessionError.message}`);
      throw new Error(`Auth session check failed: ${sessionError.message}`);
    }
    if (!session) {
      report("Check auth session", "error", "No active session — are you signed in?");
      throw new Error("No active auth session. Please sign in first.");
    }
    report("Check auth session", "done", `Signed in as ${session.user.email}`);

    // Verify the userId matches the session (RLS will reject mismatches)
    if (userId !== session.user.id) {
      report("Check auth session", "error", `userId mismatch: param=${userId.slice(0, 8)}… vs session=${session.user.id.slice(0, 8)}…`);
      throw new Error(`userId mismatch — param: ${userId} vs session: ${session.user.id}`);
    }

    // ── Step 1: Ensure user_profile exists ──────────────
    report("Create user profile", "running");
    const { error: profileError } = await sb.from("user_profile").upsert(
      { id: userId, timezone: "Europe/London" },
      { onConflict: "id" },
    );
    if (profileError) {
      report("Create user profile", "error", `${profileError.message} (code: ${profileError.code})`);
      throw new Error(`user_profile upsert failed: ${profileError.message} (code: ${profileError.code})`);
    }
    report("Create user profile", "done");

    // ── Step 2: Seed habits ─────────────────────────────
    report("Seed habits", "running");
    let idMap: Record<string, string> = {};
    const hasData = await hasExistingData(userId);
    if (!hasData) {
      idMap = await seedHabitsForUser(userId);
      report("Seed habits", "done", `${HABITS.length} habits created`);
    } else {
      // Load existing ID mapping
      const stored = typeof window !== "undefined"
        ? localStorage.getItem("accountability-habit-id-map")
        : null;
      if (stored) {
        idMap = JSON.parse(stored);
        report("Seed habits", "done", `Already seeded — loaded ${Object.keys(idMap).length} ID mappings`);
      } else {
        // Rebuild from Supabase by matching slugs
        const { data: dbHabits, error: habitsErr } = await sb
          .from("habits")
          .select("id,slug")
          .eq("user_id", userId);
        if (habitsErr) {
          report("Seed habits", "error", `Fetch habits failed: ${habitsErr.message}`);
          throw new Error(`Fetch habits: ${habitsErr.message}`);
        }
        if (dbHabits && dbHabits.length > 0) {
          const slugToNewId: Record<string, string> = {};
          for (const h of dbHabits) slugToNewId[h.slug] = h.id;
          for (const h of HABITS) {
            if (slugToNewId[h.slug]) idMap[h.id] = slugToNewId[h.slug];
          }
          if (typeof window !== "undefined") {
            localStorage.setItem("accountability-habit-id-map", JSON.stringify(idMap));
          }
        }
        report("Seed habits", "done", `Rebuilt ID map for ${Object.keys(idMap).length} habits`);
      }
    }
    const remapId = (oldId: string) => idMap[oldId] ?? oldId;

    // ── Step 3: Upload settings ─────────────────────────
    report("Upload settings", "running");
    const settings = loadSettings();
    const { error: settingsError } = await sb.from("user_settings").upsert({
      user_id: userId,
      settings_json: settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (settingsError) {
      report("Upload settings", "error", settingsError.message);
      // Non-fatal
    } else {
      report("Upload settings", "done");
    }

    // ── Step 4: Custom habits ───────────────────────────
    if (settings.customHabits && settings.customHabits.length > 0) {
      report("Upload custom habits", "running");
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
      if (error) {
        report("Upload custom habits", "error", error.message);
      } else {
        report("Upload custom habits", "done", `${customRows.length} habits`);
      }
    }

    // ── Step 5: Apply habit overrides ───────────────────
    if (settings.habitOverrides && Object.keys(settings.habitOverrides).length > 0) {
      report("Apply habit overrides", "running");
      let overrideCount = 0;
      for (const [habitId, override] of Object.entries(settings.habitOverrides)) {
        const updates: Record<string, unknown> = {};
        if (override.stack !== undefined) updates.stack = override.stack;
        if (override.is_bare_minimum !== undefined) updates.is_bare_minimum = override.is_bare_minimum;
        if (override.is_active !== undefined) updates.is_active = override.is_active;
        if (override.current_level !== undefined) updates.current_level = override.current_level;
        if (override.sort_order !== undefined) updates.sort_order = override.sort_order;

        if (Object.keys(updates).length > 0) {
          await sb.from("habits").update(updates).eq("id", remapId(habitId)).eq("user_id", userId);
          overrideCount++;
        }
      }
      report("Apply habit overrides", "done", `${overrideCount} overrides applied`);
    }

    // ── Each remaining section wrapped in try/catch ─────
    const sectionErrors: string[] = [];

    // ── Step 6: Daily logs + XP + Streaks + Sprints ─────
    try {
      report("Upload daily logs", "running");
      const state = loadState();
      if (state.logs.length > 0) {
        for (let i = 0; i < state.logs.length; i += 10) {
          const batch = state.logs.slice(i, i + 10);
          for (const dayLog of batch) {
            const remappedLog = {
              ...dayLog,
              entries: Object.fromEntries(
                Object.entries(dayLog.entries).map(([hid, v]) => [remapId(hid), v]),
              ),
              badEntries: Object.fromEntries(
                Object.entries(dayLog.badEntries).map(([hid, v]) => [remapId(hid), v]),
              ),
            };
            const { dailyLogs, badHabitLogs, summary } = dayLogToRows(remappedLog, userId);
            if (dailyLogs.length > 0) {
              const { error } = await sb.from("daily_logs").upsert(
                dailyLogs.map((r) => ({ ...r, id: crypto.randomUUID() })),
                { onConflict: "habit_id,log_date" },
              );
              if (error) throw new Error(`daily_logs: ${error.message}`);
            }
            if (badHabitLogs.length > 0) {
              const { error } = await sb.from("bad_habit_logs").upsert(
                badHabitLogs.map((r) => ({ ...r, id: crypto.randomUUID() })),
                { onConflict: "habit_id,log_date" },
              );
              if (error) throw new Error(`bad_habit_logs: ${error.message}`);
            }
            const { error: sumError } = await sb.from("daily_log_summaries").upsert(
              { ...summary, id: crypto.randomUUID() },
              { onConflict: "user_id,log_date" },
            );
            if (sumError) throw new Error(`daily_log_summaries: ${sumError.message}`);
          }
        }
        report("Upload daily logs", "done", `${state.logs.length} days`);
      } else {
        report("Upload daily logs", "skipped", "No logs in localStorage");
      }

      // XP
      report("Upload XP & streaks", "running");
      const { error: xpError } = await sb.from("user_xp").upsert({
        user_id: userId,
        total_xp: state.totalXp,
        current_level: state.currentLevel,
      }, { onConflict: "user_id" });
      if (xpError) throw new Error(`user_xp: ${xpError.message}`);

      // Streaks
      for (const [slug, count] of Object.entries(state.streaks)) {
        const habit = HABITS.find((h) => h.slug === slug) ??
          settings.customHabits?.find((h) => h.slug === slug);
        if (!habit) continue;
        const { error } = await sb.from("streaks").upsert({
          user_id: userId,
          habit_id: remapId(habit.id),
          current_count: count,
          longest_count: count,
        }, { onConflict: "user_id,habit_id" });
        if (error) throw new Error(`streaks: ${error.message}`);
      }

      // Bare minimum streak
      const { error: bmError } = await sb.from("bare_minimum_streak").upsert({
        user_id: userId,
        current_count: state.bareMinimumStreak,
        longest_count: state.bareMinimumStreak,
      }, { onConflict: "user_id" });
      if (bmError) throw new Error(`bare_minimum_streak: ${bmError.message}`);

      report("Upload XP & streaks", "done");

      // Sprints
      if (state.activeSprint || (state.sprintHistory && state.sprintHistory.length > 0)) {
        report("Upload sprints", "running");
        if (state.activeSprint) {
          const { sprint, tasks } = sprintToRows(state.activeSprint, userId);
          const { error } = await sb.from("sprints").upsert(sprint, { onConflict: "id" });
          if (error) throw new Error(`sprints: ${error.message}`);
          if (tasks.length > 0) {
            const { error: tErr } = await sb.from("sprint_tasks").upsert(tasks, { onConflict: "id" });
            if (tErr) throw new Error(`sprint_tasks: ${tErr.message}`);
          }
        }
        for (const s of state.sprintHistory ?? []) {
          const { sprint, tasks } = sprintToRows(s, userId);
          const { error } = await sb.from("sprints").upsert(sprint, { onConflict: "id" });
          if (error) throw new Error(`sprints (history): ${error.message}`);
          if (tasks.length > 0) {
            const { error: tErr } = await sb.from("sprint_tasks").upsert(tasks, { onConflict: "id" });
            if (tErr) throw new Error(`sprint_tasks (history): ${tErr.message}`);
          }
        }
        report("Upload sprints", "done");
      }

      // Reflections
      if (state.reflections && state.reflections.length > 0) {
        report("Upload reflections", "running");
        const rows = state.reflections.map((r) => reflectionToRow(r, userId));
        const { error } = await sb.from("wrap_reflections").upsert(rows, { onConflict: "id" });
        if (error) throw new Error(`reflections: ${error.message}`);
        report("Upload reflections", "done", `${rows.length} reflections`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report("Upload daily logs", "error", msg);
      sectionErrors.push(`daily logs: ${msg}`);
    }

    // ── Step 7: Gym sessions ────────────────────────────
    try {
      report("Upload gym sessions", "running");
      const gymSessions = loadGymSessions();
      if (gymSessions.length > 0) {
        for (const session of gymSessions) {
          const { session: sessionRow, exercises } = gymSessionToRows(session, userId);
          const { error: sErr } = await sb.from("gym_sessions").upsert(sessionRow, { onConflict: "id" });
          if (sErr) throw new Error(`gym_sessions: ${sErr.message} (${JSON.stringify(sessionRow).slice(0, 100)})`);
          for (const ex of exercises) {
            const { sets, ...exRow } = ex;
            const { error: eErr } = await sb.from("gym_exercises").upsert(exRow, { onConflict: "id" });
            if (eErr) throw new Error(`gym_exercises: ${eErr.message}`);
            if (sets.length > 0) {
              // Delete existing sets for this exercise to avoid duplicates on re-run
              // (gym_sets.id is a new random UUID each time, so upsert never matches)
              await sb.from("gym_sets").delete().eq("exercise_id", ex.id);
              const { error: setErr } = await sb.from("gym_sets").insert(sets);
              if (setErr) throw new Error(`gym_sets: ${setErr.message}`);
            }
          }
        }
        report("Upload gym sessions", "done", `${gymSessions.length} sessions`);
      } else {
        report("Upload gym sessions", "skipped", "No gym sessions");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report("Upload gym sessions", "error", msg);
      sectionErrors.push(`gym: ${msg}`);
    }

    // ── Step 8: Gym routines ────────────────────────────
    try {
      report("Upload gym routines", "running");
      const gymRoutines = loadGymRoutines();
      if (gymRoutines.length > 0) {
        for (const routine of gymRoutines) {
          const { routine: routineRow, exercises } = gymRoutineToRows(routine, userId);
          const { error: rErr } = await sb.from("gym_routines").upsert(routineRow, { onConflict: "id" });
          if (rErr) throw new Error(`gym_routines: ${rErr.message}`);
          if (exercises.length > 0) {
            // Delete existing routine exercises to avoid duplicates on re-run
            // (gym_routine_exercises.id is a new random UUID each time)
            await sb.from("gym_routine_exercises").delete().eq("routine_id", routine.id);
            const { error: exErr } = await sb.from("gym_routine_exercises").insert(exercises);
            if (exErr) throw new Error(`gym_routine_exercises: ${exErr.message}`);
          }
        }
        report("Upload gym routines", "done", `${gymRoutines.length} routines`);
      } else {
        report("Upload gym routines", "skipped", "No routines");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report("Upload gym routines", "error", msg);
      sectionErrors.push(`gym routines: ${msg}`);
    }

    // ── Step 9: Admin tasks ─────────────────────────────
    try {
      report("Upload admin tasks", "running");
      const adminTasks = loadAllAdminTasks();
      if (adminTasks.length > 0) {
        const rows = adminTasks.map((t) => adminTaskToRow(t, userId));
        const { error } = await sb.from("admin_tasks").upsert(rows, { onConflict: "id" });
        if (error) throw new Error(`admin_tasks: ${error.message} (code: ${error.code})`);
        report("Upload admin tasks", "done", `${adminTasks.length} tasks`);
      } else {
        report("Upload admin tasks", "skipped", "No admin tasks");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report("Upload admin tasks", "error", msg);
      sectionErrors.push(`admin: ${msg}`);
    }

    // ── Step 10: Showing up data ────────────────────────
    try {
      report("Upload app usage", "running");
      const showingUp = loadShowingUpData();
      if (showingUp.totalOpens > 0) {
        const { error } = await sb.from("app_usage_stats").upsert({
          ...showingUpToRow(showingUp, userId),
        }, { onConflict: "user_id" });
        if (error) throw new Error(`app_usage_stats: ${error.message}`);
        report("Upload app usage", "done", `${showingUp.totalOpens} opens, ${showingUp.uniqueDays} days`);
      } else {
        report("Upload app usage", "skipped", "No usage data");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report("Upload app usage", "error", msg);
      sectionErrors.push(`app usage: ${msg}`);
    }

    // ── Done ────────────────────────────────────────────
    markMigrated();
    if (sectionErrors.length > 0) {
      report("Summary", "error", `Partial success. Errors in: ${sectionErrors.join("; ")}`);
    } else {
      report("Summary", "done", "All data uploaded successfully!");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't mark as migrated — will retry next time
    // Find which step is still "running" and mark it as error
    const running = steps.find((s) => s.status === "running");
    if (running) {
      running.status = "error";
      running.detail = msg;
    }
    steps.push({ step: "FATAL", status: "error", detail: msg });
    onProgress?.([...steps]);
    throw new Error(msg);
  }
}
