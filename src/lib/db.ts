// Supabase sync layer — drop-in async replacements for store.ts functions.
// When authenticated + online: reads/writes Supabase, caches in localStorage.
// When offline or unauthenticated: falls back to localStorage (current behavior).

import { supabase } from "@/lib/supabase";
import {
  loadState,
  saveState,
  loadSettings,
  saveSettings,
  loadGymSessions,
  saveGymSession as saveGymSessionLocal,
  loadGymRoutines,
  saveGymRoutines,
  loadAdminTasks,
  recordAppOpen,
  loadShowingUpData,
  getToday,
} from "@/lib/store";
import type {
  LocalState,
  UserSettings,
  DayLog,
  GymSessionLocal,
  GymRoutine,
  AdminTask,
  ShowingUpData,
} from "@/lib/store";
import { isOnline } from "./sync/online";
import { enqueue, flush, hasPending } from "./sync/queue";
import {
  dayLogToRows,
  supabaseToLocalState,
  gymSessionToRows,
  gymRoutineToRows,
  adminTaskToRow,
  rowToAdminTask,
  showingUpToRow,
  rowToShowingUp,
  sprintToRows,
  reflectionToRow,
} from "./sync/transforms";
import type { SupabaseFetchResult } from "./sync/types";

// ─── Helpers ────────────────────────────────────────────

/**
 * Typed upsert/insert helpers. The Supabase client's generic typing is strict
 * with enum fields, but our transforms use plain strings. These helpers bypass
 * strict type checking while keeping the runtime behavior correct.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbUpsert(table: string, data: any, options?: { onConflict?: string }) {
  return supabase.from(table).upsert(data, options);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbInsert(table: string, data: any) {
  return supabase.from(table).insert(data);
}

function dbDelete(table: string) {
  return supabase.from(table).delete();
}

/** Get current authenticated user ID, or null */
async function getAuthUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Check if we can use Supabase (authenticated + online) */
async function canUseSupabase(): Promise<{ ok: boolean; userId: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, userId: "" };
  if (!isOnline()) return { ok: false, userId };
  return { ok: true, userId };
}

// ─── State (main app data) ──────────────────────────────

/** Load full app state. Tries Supabase first, falls back to localStorage. */
export async function loadStateFromDB(): Promise<LocalState> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) return loadState();

  try {
    // Flush any pending offline writes first
    if (hasPending()) {
      await flush();
    }

    // Fetch all data from Supabase in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [
      dailyLogsRes,
      badHabitLogsRes,
      logSummariesRes,
      streaksRes,
      bareMinStreakRes,
      userXpRes,
      sprintsRes,
      sprintTasksRes,
      reflectionsRes,
      habitsRes,
    ] = await Promise.all([
      sb.from("daily_logs").select("*").eq("user_id", userId).order("log_date", { ascending: false }),
      sb.from("bad_habit_logs").select("*").eq("user_id", userId),
      sb.from("daily_log_summaries").select("*").eq("user_id", userId),
      sb.from("streaks").select("*").eq("user_id", userId),
      sb.from("bare_minimum_streak").select("*").eq("user_id", userId).single(),
      sb.from("user_xp").select("*").eq("user_id", userId).single(),
      sb.from("sprints").select("*").eq("user_id", userId),
      sb.from("sprint_tasks").select("*"),
      sb.from("wrap_reflections").select("*").eq("user_id", userId),
      sb.from("habits").select("id,slug").eq("user_id", userId),
    ]);

    const dailyLogs = dailyLogsRes.data ?? [];
    const badHabitLogs = badHabitLogsRes.data ?? [];
    const logSummaries = logSummariesRes.data ?? [];
    const streaks = streaksRes.data ?? [];
    const bareMinStreak = bareMinStreakRes.data ?? null;
    const userXp = userXpRes.data ?? null;
    const sprints = sprintsRes.data ?? [];
    const sprintTasks = sprintTasksRes.data ?? [];
    const reflectionsRaw = reflectionsRes.data ?? [];
    const habitsForSlug = (habitsRes.data ?? []) as { id: string; slug: string }[];

    // Build habit ID → slug mapping for streak keys
    const habitIdToSlug: Record<string, string> = {};
    for (const h of habitsForSlug) {
      habitIdToSlug[h.id] = h.slug;
    }

    // Find the most recent reflection date for lastWrapDate
    const sortedReflections = (reflectionsRaw as SupabaseFetchResult["reflections"]).sort((a, b) =>
      b.reflection_date.localeCompare(a.reflection_date)
    );
    const lastWrapDate = sortedReflections[0]?.reflection_date ?? null;

    const state = supabaseToLocalState({
      dailyLogs: dailyLogs as SupabaseFetchResult["dailyLogs"],
      badHabitLogs: badHabitLogs as SupabaseFetchResult["badHabitLogs"],
      logSummaries: logSummaries as SupabaseFetchResult["logSummaries"],
      streaks: streaks as SupabaseFetchResult["streaks"],
      bareMinimumStreak: bareMinStreak as SupabaseFetchResult["bareMinimumStreak"],
      userXp: userXp as SupabaseFetchResult["userXp"],
      sprints: sprints as SupabaseFetchResult["sprints"],
      sprintTasks: sprintTasks as SupabaseFetchResult["sprintTasks"],
      reflections: sortedReflections,
      lastWrapDate,
    }, habitIdToSlug);

    // Safety: only cache in localStorage if Supabase actually has data.
    // If Supabase is empty (upload never completed), preserve existing localStorage.
    const localState = loadState();
    const supabaseHasData = dailyLogs.length > 0 || (userXp?.total_xp ?? 0) > 0;
    const localHasData = localState.logs.length > 0 || localState.totalXp > 0;

    if (supabaseHasData) {
      // Sprint reconciliation: localStorage is written synchronously and is always
      // the freshest source for sprint state. If the user just ended a sprint,
      // localStorage has activeSprint: null but the async Supabase write may not
      // have landed yet. Trust localStorage's sprint state over Supabase's.
      const localSprintIsNewer =
        localState.activeSprint === null && state.activeSprint !== null;
      const localHasMoreHistory =
        (localState.sprintHistory?.length ?? 0) > (state.sprintHistory?.length ?? 0);

      if (localSprintIsNewer || localHasMoreHistory) {
        console.log("[db] Sprint reconciliation: trusting localStorage sprint state over Supabase");
        state.activeSprint = localState.activeSprint;
        state.sprintHistory = localState.sprintHistory ?? [];
      }

      // Supabase has real data — cache it locally
      saveState(state);
      return state;
    } else if (localHasData) {
      // Supabase is empty but localStorage has data — keep local, don't overwrite
      console.warn("[db] Supabase is empty but localStorage has data — keeping local data");
      return localState;
    }

    // Both empty — just return the (empty) Supabase state
    return state;
  } catch (err) {
    console.warn("[db] Failed to load from Supabase, falling back to localStorage:", err);
    return loadState();
  }
}

/** Save a DayLog (check-in submission). Writes localStorage immediately + Supabase async. */
export async function saveDayLogToDB(dayLog: DayLog, fullState: LocalState): Promise<void> {
  // Always write to localStorage first (instant UI update)
  saveState(fullState);

  const { ok, userId } = await canUseSupabase();
  if (!ok) {
    // Queue for later sync
    const { dailyLogs, badHabitLogs, summary } = dayLogToRows(dayLog, "");
    for (const row of dailyLogs) {
      enqueue({ table: "daily_logs", action: "upsert", data: row, conflictColumn: "habit_id,log_date" });
    }
    for (const row of badHabitLogs) {
      enqueue({ table: "bad_habit_logs", action: "upsert", data: row, conflictColumn: "habit_id,log_date" });
    }
    enqueue({ table: "daily_log_summaries", action: "upsert", data: summary, conflictColumn: "user_id,log_date" });
    return;
  }

  try {
    const { dailyLogs, badHabitLogs, summary } = dayLogToRows(dayLog, userId);

    if (dailyLogs.length > 0) {
      await dbUpsert("daily_logs",
        dailyLogs.map((r) => ({ ...r, id: crypto.randomUUID() })),
        { onConflict: "habit_id,log_date" }
      );
    }

    if (badHabitLogs.length > 0) {
      await dbUpsert("bad_habit_logs",
        badHabitLogs.map((r) => ({ ...r, id: crypto.randomUUID() })),
        { onConflict: "habit_id,log_date" }
      );
    }

    await dbUpsert("daily_log_summaries",
      { ...summary, id: crypto.randomUUID() },
      { onConflict: "user_id,log_date" }
    );

    // Sync XP
    await dbUpsert("user_xp", {
      user_id: userId,
      total_xp: fullState.totalXp,
      current_level: fullState.currentLevel,
    }, { onConflict: "user_id" });

    // Sync bare minimum streak
    await dbUpsert("bare_minimum_streak", {
      user_id: userId,
      current_count: fullState.bareMinimumStreak,
      last_met_date: dayLog.bareMinimumMet ? dayLog.date : undefined,
    }, { onConflict: "user_id" });

    // Sync individual streaks
    for (const [slug, count] of Object.entries(fullState.streaks)) {
      await dbUpsert("streaks", {
        user_id: userId,
        habit_id: slug,
        current_count: count,
      }, { onConflict: "user_id,habit_id" });
    }
  } catch (err) {
    console.warn("[db] Failed to save day log to Supabase:", err);
    // Data is safe in localStorage, will sync later
  }
}

/** Save full state (for operations like editing a log, sprint changes, etc.) */
export async function saveStateToDB(state: LocalState): Promise<void> {
  // Safety: never persist empty state — this would wipe real data
  const existingLocal = loadState();
  const localHasData = existingLocal.logs.length > 0 || existingLocal.totalXp > 0;
  const stateHasData = state.logs.length > 0 || state.totalXp > 0;
  if (localHasData && !stateHasData) {
    console.warn("[db] saveStateToDB blocked: refusing to overwrite data with empty state");
    return;
  }

  // Always save to localStorage
  saveState(state);

  const { ok, userId } = await canUseSupabase();
  if (!ok) return; // Will sync on next online session

  try {
    // Sync XP
    await dbUpsert("user_xp", {
      user_id: userId,
      total_xp: state.totalXp,
      current_level: state.currentLevel,
    }, { onConflict: "user_id" });

    // Sync active sprint if it exists
    if (state.activeSprint) {
      const { sprint, tasks } = sprintToRows(state.activeSprint, userId);
      await dbUpsert("sprints", sprint, { onConflict: "id" });
      if (tasks.length > 0) {
        await dbUpsert("sprint_tasks", tasks, { onConflict: "id" });
      }
    }

    // Sync completed/cancelled sprints in history
    // This handles the case where a sprint was just ended (activeSprint → null)
    // and the archived sprint needs to be updated in Supabase so it's no longer "active".
    if (state.sprintHistory && state.sprintHistory.length > 0) {
      for (const historicSprint of state.sprintHistory) {
        const { sprint, tasks } = sprintToRows(historicSprint, userId);
        await dbUpsert("sprints", sprint, { onConflict: "id" });
        if (tasks.length > 0) {
          await dbUpsert("sprint_tasks", tasks, { onConflict: "id" });
        }
      }
    }

    // Sync reflections
    if (state.reflections && state.reflections.length > 0) {
      const rows = state.reflections.map((r) => reflectionToRow(r, userId));
      await dbUpsert("wrap_reflections", rows, { onConflict: "id" });
    }
  } catch (err) {
    console.warn("[db] Failed to save state to Supabase:", err);
  }
}

// ─── Settings ───────────────────────────────────────────

export async function loadSettingsFromDB(): Promise<UserSettings> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) return loadSettings();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("user_settings") as any)
      .select("settings_json")
      .eq("user_id", userId)
      .single();

    if (error || !data) return loadSettings();

    const settings = data.settings_json as UserSettings;
    // Merge with defaults so any new fields are present
    const merged = { ...loadSettings(), ...settings };
    // Cache in localStorage
    saveSettings(merged);
    return merged;
  } catch {
    return loadSettings();
  }
}

export async function saveSettingsToDB(settings: UserSettings): Promise<void> {
  // Always save to localStorage
  saveSettings(settings);

  const { ok, userId } = await canUseSupabase();
  if (!ok) {
    enqueue({
      table: "user_settings",
      action: "upsert",
      data: { user_id: userId || "", settings_json: settings },
      conflictColumn: "user_id",
    });
    return;
  }

  try {
    await dbUpsert("user_settings", {
      user_id: userId,
      settings_json: settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  } catch (err) {
    console.warn("[db] Failed to save settings to Supabase:", err);
  }
}

// ─── Admin Tasks ────────────────────────────────────────

export async function loadAdminTasksFromDB(date?: string): Promise<AdminTask[]> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) return loadAdminTasks(date);

  try {
    const target = date ?? getToday();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("admin_tasks") as any)
      .select("*")
      .eq("user_id", userId)
      .eq("task_date", target)
      .order("created_at", { ascending: true });

    if (error || !data) return loadAdminTasks(date);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = (data as any[]).map(rowToAdminTask);
    return tasks;
  } catch {
    return loadAdminTasks(date);
  }
}

export async function loadAdminBacklogFromDB(): Promise<AdminTask[]> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) {
    const { loadAdminBacklog } = await import("@/lib/store");
    return loadAdminBacklog();
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("admin_tasks") as any)
      .select("*")
      .eq("user_id", userId)
      .eq("in_backlog", true)
      .eq("completed", false)
      .order("created_at", { ascending: true });

    if (error || !data) {
      const { loadAdminBacklog } = await import("@/lib/store");
      return loadAdminBacklog();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(rowToAdminTask);
  } catch {
    const { loadAdminBacklog } = await import("@/lib/store");
    return loadAdminBacklog();
  }
}

export async function saveAdminTaskToDB(task: AdminTask): Promise<void> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) {
    enqueue({ table: "admin_tasks", action: "upsert", data: adminTaskToRow(task, "") });
    return;
  }

  try {
    await dbUpsert("admin_tasks", adminTaskToRow(task, userId), { onConflict: "id" });
  } catch (err) {
    console.warn("[db] Failed to save admin task to Supabase:", err);
  }
}

export async function deleteAdminTaskFromDB(taskId: string): Promise<void> {
  const { ok } = await canUseSupabase();
  if (!ok) {
    enqueue({ table: "admin_tasks", action: "delete", data: { id: taskId } });
    return;
  }

  try {
    await dbDelete("admin_tasks").eq("id", taskId);
  } catch (err) {
    console.warn("[db] Failed to delete admin task from Supabase:", err);
  }
}

// ─── Gym Sessions ───────────────────────────────────────

export async function loadGymSessionsFromDB(): Promise<GymSessionLocal[]> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) return loadGymSessions();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessions, error } = await (supabase.from("gym_sessions") as any)
      .select("*, gym_exercises(*, gym_sets(*))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error || !sessions) return loadGymSessions();

    // Transform Supabase rows back to local format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (sessions as any[]).map((s) => ({
      id: s.id as string,
      date: s.session_date as string,
      trainingType: s.training_type as GymSessionLocal["trainingType"],
      muscleGroup: (s.muscle_group as string) || null,
      durationMinutes: s.duration_minutes as number | null,
      rpe: s.rpe as number | null,
      notes: (s.notes as string) || "",
      justWalkedIn: s.just_walked_in as boolean,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercises: ((s.gym_exercises ?? []) as any[])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((ex: any) => ({
          id: ex.id as string,
          name: ex.exercise_name as string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sets: ((ex.gym_sets ?? []) as any[])
            .sort((a: { set_number: number }, b: { set_number: number }) => a.set_number - b.set_number)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((set: any) => ({
              weightKg: set.weight_kg as number | null,
              reps: set.reps as number | null,
              isFailure: set.is_failure as boolean,
            })),
        })),
      createdAt: s.created_at as string,
    }));
  } catch {
    return loadGymSessions();
  }
}

export async function saveGymSessionToDB(session: GymSessionLocal): Promise<void> {
  // Always save locally
  saveGymSessionLocal(session);

  const { ok, userId } = await canUseSupabase();
  if (!ok) return;

  try {
    const { session: sessionRow, exercises } = gymSessionToRows(session, userId);

    await dbUpsert("gym_sessions", sessionRow, { onConflict: "id" });

    for (const ex of exercises) {
      const { sets, ...exRow } = ex;
      await dbUpsert("gym_exercises", exRow, { onConflict: "id" });
      if (sets.length > 0) {
        await dbUpsert("gym_sets", sets, { onConflict: "id" });
      }
    }
  } catch (err) {
    console.warn("[db] Failed to save gym session to Supabase:", err);
  }
}

// ─── Gym Routines ───────────────────────────────────────

export async function loadGymRoutinesFromDB(): Promise<GymRoutine[]> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) return loadGymRoutines();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: routines, error } = await (supabase.from("gym_routines") as any)
      .select("*, gym_routine_exercises(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error || !routines) return loadGymRoutines();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (routines as any[]).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      trainingType: r.training_type as GymRoutine["trainingType"],
      muscleGroup: (r.muscle_group as string) || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercises: ((r.gym_routine_exercises ?? []) as any[])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((ex: any) => ({
          name: ex.exercise_name as string,
          defaultSets: ex.default_sets as number,
        })),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  } catch {
    return loadGymRoutines();
  }
}

export async function saveGymRoutineToDB(routine: GymRoutine): Promise<void> {
  // Also save locally
  const routines = loadGymRoutines();
  const idx = routines.findIndex((r) => r.id === routine.id);
  if (idx >= 0) {
    routines[idx] = routine;
  } else {
    routines.push(routine);
  }
  saveGymRoutines(routines);

  const { ok, userId } = await canUseSupabase();
  if (!ok) return;

  try {
    const { routine: routineRow, exercises } = gymRoutineToRows(routine, userId);

    await dbUpsert("gym_routines", routineRow, { onConflict: "id" });

    // Delete existing exercises and re-insert (simpler than diffing)
    await dbDelete("gym_routine_exercises").eq("routine_id", routine.id);
    if (exercises.length > 0) {
      await dbInsert("gym_routine_exercises", exercises);
    }
  } catch (err) {
    console.warn("[db] Failed to save gym routine to Supabase:", err);
  }
}

export async function deleteGymRoutineFromDB(routineId: string): Promise<void> {
  // Delete locally
  const routines = loadGymRoutines().filter((r) => r.id !== routineId);
  saveGymRoutines(routines);

  const { ok } = await canUseSupabase();
  if (!ok) {
    enqueue({ table: "gym_routines", action: "delete", data: { id: routineId } });
    return;
  }

  try {
    await dbDelete("gym_routines").eq("id", routineId);
  } catch (err) {
    console.warn("[db] Failed to delete gym routine from Supabase:", err);
  }
}

// ─── Showing Up Counter ─────────────────────────────────

export async function recordAppOpenToDB(): Promise<ShowingUpData> {
  // Always record locally
  const data = recordAppOpen();

  const { ok, userId } = await canUseSupabase();
  if (!ok) return data;

  try {
    await dbUpsert("app_usage_stats",
      showingUpToRow(data, userId),
      { onConflict: "user_id" }
    );
  } catch (err) {
    console.warn("[db] Failed to save showing up data to Supabase:", err);
  }

  return data;
}

export async function loadShowingUpFromDB(): Promise<ShowingUpData> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) return loadShowingUpData();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("app_usage_stats") as any)
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !data) return loadShowingUpData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rowToShowingUp(data as any);
  } catch {
    return loadShowingUpData();
  }
}

// ─── Habits (fetch from Supabase) ───────────────────────

export async function loadHabitsFromDB(): Promise<{ habits: import("@/types/database").Habit[]; levels: import("@/types/database").HabitLevel[] } | null> {
  const { ok, userId } = await canUseSupabase();
  if (!ok) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = supabase as any;
    const [habitsRes, levelsRes] = await Promise.all([
      sbAny.from("habits").select("*").eq("user_id", userId),
      sbAny.from("habit_levels").select("*"),
    ]);

    if (!habitsRes.data || habitsRes.data.length === 0) return null;

    return {
      habits: habitsRes.data as import("@/types/database").Habit[],
      levels: (levelsRes.data ?? []) as import("@/types/database").HabitLevel[],
    };
  } catch {
    return null;
  }
}

// ─── Sync status helpers ────────────────────────────────

/** Attempt to flush pending operations (call on reconnect) */
export async function syncPendingOperations(): Promise<{ synced: number; failed: number }> {
  if (!isOnline()) return { synced: 0, failed: 0 };
  return flush();
}

/** Check if there are unsynced local changes */
export function hasUnsyncedChanges(): boolean {
  return hasPending();
}
