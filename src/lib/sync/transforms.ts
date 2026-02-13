// Data shape transformers — converts between localStorage flat blobs
// and Supabase normalized rows.
//
// localStorage DayLog: { date, entries: Record<habitId, {status, value}>, badEntries: Record<habitId, {occurred, durationMinutes}>, xpEarned, ... }
// Supabase: one daily_logs row per habit per day + one bad_habit_logs row per bad habit per day + one daily_log_summaries row per day

import type { DayLog, SprintData, WrapReflection, LocalState, GymSessionLocal, GymRoutine, AdminTask, ShowingUpData } from "@/lib/store";
import type { LogStatus, SprintIntensity } from "@/types/database";
import type {
  SupabaseDailyLogRow,
  SupabaseBadHabitLogRow,
  SupabaseLogSummaryRow,
  SupabaseFetchResult,
  SupabaseSprintRow,
  SupabaseSprintTaskRow,
  SupabaseReflectionRow,
} from "./types";

// ─── DayLog ↔ Supabase rows ────────────────────────────

export interface DayLogRows {
  dailyLogs: Omit<SupabaseDailyLogRow, "id">[];
  badHabitLogs: Omit<SupabaseBadHabitLogRow, "id">[];
  summary: {
    user_id: string;
    log_date: string;
    xp_earned: number;
    bare_minimum_met: boolean;
    submitted_at: string | null;
    admin_summary: DayLog["adminSummary"] | null;
  };
}

/** Convert a flat DayLog to normalized Supabase rows */
export function dayLogToRows(dayLog: DayLog, userId: string): DayLogRows {
  const dailyLogs: Omit<SupabaseDailyLogRow, "id">[] = [];
  const badHabitLogs: Omit<SupabaseBadHabitLogRow, "id">[] = [];

  // Regular habit entries → daily_logs rows
  for (const [habitId, entry] of Object.entries(dayLog.entries)) {
    dailyLogs.push({
      user_id: userId,
      habit_id: habitId,
      log_date: dayLog.date,
      status: entry.status,
      value: entry.value,
      notes: null,
      logged_at: dayLog.submittedAt || new Date().toISOString(),
    });
  }

  // Bad habit entries → bad_habit_logs rows
  for (const [habitId, entry] of Object.entries(dayLog.badEntries)) {
    badHabitLogs.push({
      user_id: userId,
      habit_id: habitId,
      log_date: dayLog.date,
      occurred: entry.occurred,
      duration_minutes: entry.durationMinutes,
      notes: null,
      logged_at: dayLog.submittedAt || new Date().toISOString(),
    });
  }

  // Per-day summary
  const summary = {
    user_id: userId,
    log_date: dayLog.date,
    xp_earned: dayLog.xpEarned,
    bare_minimum_met: dayLog.bareMinimumMet,
    submitted_at: dayLog.submittedAt || null,
    admin_summary: dayLog.adminSummary ?? null,
  };

  return { dailyLogs, badHabitLogs, summary };
}

/** Convert Supabase normalized rows back to flat DayLog format.
 *  Groups rows by date and reconstructs the localStorage DayLog shape. */
export function rowsToDayLogs(
  dailyLogs: SupabaseDailyLogRow[],
  badHabitLogs: SupabaseBadHabitLogRow[],
  summaries: SupabaseLogSummaryRow[]
): DayLog[] {
  // Group by date
  const byDate = new Map<string, {
    entries: Record<string, { status: LogStatus; value: number | null }>;
    badEntries: Record<string, { occurred: boolean; durationMinutes: number | null }>;
  }>();

  for (const row of dailyLogs) {
    if (!byDate.has(row.log_date)) {
      byDate.set(row.log_date, { entries: {}, badEntries: {} });
    }
    byDate.get(row.log_date)!.entries[row.habit_id] = {
      status: row.status as LogStatus,
      value: row.value,
    };
  }

  for (const row of badHabitLogs) {
    if (!byDate.has(row.log_date)) {
      byDate.set(row.log_date, { entries: {}, badEntries: {} });
    }
    byDate.get(row.log_date)!.badEntries[row.habit_id] = {
      occurred: row.occurred,
      durationMinutes: row.duration_minutes,
    };
  }

  // Build summary lookup
  const summaryByDate = new Map<string, SupabaseLogSummaryRow>();
  for (const s of summaries) {
    summaryByDate.set(s.log_date, s);
  }

  // Assemble DayLog array
  const logs: DayLog[] = [];
  const allDates = new Set([...byDate.keys(), ...summaryByDate.keys()]);

  for (const date of allDates) {
    const data = byDate.get(date) ?? { entries: {}, badEntries: {} };
    const summary = summaryByDate.get(date);

    logs.push({
      date,
      entries: data.entries,
      badEntries: data.badEntries,
      adminSummary: summary?.admin_summary ?? undefined,
      xpEarned: summary?.xp_earned ?? 0,
      bareMinimumMet: summary?.bare_minimum_met ?? false,
      submittedAt: summary?.submitted_at ?? "",
    });
  }

  // Sort by date descending (newest first, matching localStorage convention)
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Sprint ↔ Supabase ─────────────────────────────────

export function sprintToRows(sprint: SprintData, userId: string): {
  sprint: Omit<SupabaseSprintRow, "user_id"> & { user_id: string };
  tasks: (Omit<SupabaseSprintTaskRow, "sprint_id"> & { sprint_id: string })[];
} {
  return {
    sprint: {
      id: sprint.id,
      user_id: userId,
      name: sprint.name,
      intensity: sprint.intensity,
      status: sprint.status,
      start_date: sprint.startDate,
      deadline: sprint.deadline,
      completed_at: sprint.completedAt,
      bare_minimum_days_met: sprint.bareMinimumDaysMet,
      total_sprint_days: 0,
      badge_earned: null,
    },
    tasks: sprint.tasks.map((t, i) => ({
      id: t.id,
      sprint_id: sprint.id,
      parent_task_id: t.parentId,
      title: t.title,
      is_completed: t.completed,
      due_date: t.dueDate,
      sort_order: i,
      completed_at: t.completedAt,
    })),
  };
}

export function rowsToSprint(
  sprint: SupabaseSprintRow,
  tasks: SupabaseSprintTaskRow[]
): SprintData {
  return {
    id: sprint.id,
    name: sprint.name,
    intensity: sprint.intensity as SprintIntensity,
    startDate: sprint.start_date,
    deadline: sprint.deadline,
    status: sprint.status as "active" | "completed" | "cancelled",
    tasks: tasks
      .filter((t) => t.sprint_id === sprint.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({
        id: t.id,
        parentId: t.parent_task_id,
        title: t.title,
        completed: t.is_completed,
        dueDate: t.due_date,
        completedAt: t.completed_at,
      })),
    bareMinimumDaysMet: sprint.bare_minimum_days_met,
    completedAt: sprint.completed_at,
  };
}

// ─── Reflections ↔ Supabase ─────────────────────────────

export function reflectionToRow(r: WrapReflection, userId: string): Omit<SupabaseReflectionRow, "user_id"> & { user_id: string } {
  return {
    id: r.id,
    user_id: userId,
    reflection_date: r.date,
    period: r.period,
    question: r.question,
    answer: r.answer,
    forward_intention: r.forwardIntention ?? null,
  };
}

export function rowToReflection(row: SupabaseReflectionRow): WrapReflection {
  return {
    id: row.id,
    date: row.reflection_date,
    period: row.period as WrapReflection["period"],
    question: row.question,
    answer: row.answer,
    forwardIntention: row.forward_intention ?? undefined,
  };
}

// ─── Gym Sessions ↔ Supabase ────────────────────────────

export function gymSessionToRows(session: GymSessionLocal, userId: string) {
  return {
    session: {
      id: session.id,
      user_id: userId,
      session_date: session.date,
      training_type: session.trainingType,
      muscle_group: session.muscleGroup,
      duration_minutes: session.durationMinutes,
      rpe: session.rpe,
      notes: session.notes || null,
      just_walked_in: session.justWalkedIn,
      created_at: session.createdAt || new Date().toISOString(),
    },
    exercises: session.exercises.map((ex, i) => ({
      id: ex.id,
      session_id: session.id,
      exercise_name: ex.name,
      sort_order: i,
      sets: ex.sets.map((s, j) => ({
        id: crypto.randomUUID(),
        exercise_id: ex.id,
        set_number: j + 1,
        weight_kg: s.weightKg,
        reps: s.reps,
        is_failure: s.isFailure,
      })),
    })),
  };
}

// ─── Gym Routines ↔ Supabase ────────────────────────────

export function gymRoutineToRows(routine: GymRoutine, userId: string) {
  return {
    routine: {
      id: routine.id,
      user_id: userId,
      name: routine.name,
      training_type: routine.trainingType,
      muscle_group: routine.muscleGroup,
      created_at: routine.createdAt || new Date().toISOString(),
      updated_at: routine.updatedAt || new Date().toISOString(),
    },
    exercises: routine.exercises.map((ex, i) => ({
      id: crypto.randomUUID(),
      routine_id: routine.id,
      exercise_name: ex.name,
      default_sets: ex.defaultSets,
      sort_order: i,
    })),
  };
}

// ─── Admin Tasks ↔ Supabase ─────────────────────────────

export function adminTaskToRow(task: AdminTask, userId: string) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    completed: task.completed,
    task_date: task.date || null,
    source: task.source,
    in_backlog: task.inBacklog,
    completed_at: task.completedAt || null,
    created_at: task.createdAt || new Date().toISOString(),
  };
}

export function rowToAdminTask(row: {
  id: string;
  title: string;
  completed: boolean;
  task_date: string | null;
  source: string;
  in_backlog: boolean;
  completed_at: string | null;
  created_at: string;
}): AdminTask {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    date: row.task_date ?? "",
    source: row.source as "adhoc" | "planned" | "backlog",
    inBacklog: row.in_backlog,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

// ─── Showing Up ↔ Supabase ──────────────────────────────

export function showingUpToRow(data: ShowingUpData, userId: string) {
  return {
    user_id: userId,
    total_opens: data.totalOpens,
    unique_days: data.uniqueDays,
    last_open_date: data.lastOpenDate || null,
    first_open_date: data.firstOpenDate || null,
  };
}

export function rowToShowingUp(row: {
  total_opens: number;
  unique_days: number;
  last_open_date: string | null;
  first_open_date: string | null;
}): ShowingUpData {
  return {
    totalOpens: row.total_opens,
    uniqueDays: row.unique_days,
    lastOpenDate: row.last_open_date ?? "",
    firstOpenDate: row.first_open_date ?? "",
  };
}

// ─── Full LocalState reconstruction from Supabase ───────

export function supabaseToLocalState(
  data: SupabaseFetchResult,
  habitIdToSlug?: Record<string, string>,
): LocalState {
  // Reconstruct logs
  const logs = rowsToDayLogs(data.dailyLogs, data.badHabitLogs, data.logSummaries);

  // Reconstruct streaks: convert habit_id → slug key (app expects slug keys)
  const streaks: Record<string, number> = {};
  for (const s of data.streaks) {
    const key = habitIdToSlug?.[s.habit_id] ?? s.habit_id;
    streaks[key] = s.current_count;
  }

  // Reconstruct sprints
  const allSprints = data.sprints.map((s) => rowsToSprint(s, data.sprintTasks));
  const activeSprint = allSprints.find((s) => s.status === "active") ?? null;
  const sprintHistory = allSprints.filter((s) => s.status !== "active");

  // Reconstruct reflections
  const reflections = data.reflections.map(rowToReflection);

  return {
    totalXp: data.userXp?.total_xp ?? 0,
    currentLevel: data.userXp?.current_level ?? 1,
    streaks,
    bareMinimumStreak: data.bareMinimumStreak?.current_count ?? 0,
    logs,
    activeSprint,
    sprintHistory,
    reflections,
    lastWrapDate: data.lastWrapDate ?? undefined,
  };
}
