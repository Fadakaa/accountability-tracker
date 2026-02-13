// Sync layer types for Supabase data synchronization

export interface SyncOperation {
  id: string;                       // unique operation ID (crypto.randomUUID)
  timestamp: string;                // ISO timestamp of when the operation was created
  table: string;                    // Supabase table name
  action: "upsert" | "delete";
  data: Record<string, unknown>;    // row data including user_id
  conflictColumn?: string;          // for upsert: column to match on (e.g. "id" or composite)
  retries: number;                  // how many times we've tried to push this
}

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

/** Result of a Supabase fetch for reconstructing LocalState */
export interface SupabaseFetchResult {
  dailyLogs: SupabaseDailyLogRow[];
  badHabitLogs: SupabaseBadHabitLogRow[];
  logSummaries: SupabaseLogSummaryRow[];
  streaks: SupabaseStreakRow[];
  bareMinimumStreak: SupabaseBareMinStreakRow | null;
  userXp: SupabaseUserXpRow | null;
  sprints: SupabaseSprintRow[];
  sprintTasks: SupabaseSprintTaskRow[];
  reflections: SupabaseReflectionRow[];
  lastWrapDate: string | null;
}

// ─── Row types matching Supabase table columns ───────────

export interface SupabaseDailyLogRow {
  id: string;
  user_id: string;
  habit_id: string;
  log_date: string;
  status: string;
  value: number | null;
  notes: string | null;
  logged_at: string;
}

export interface SupabaseBadHabitLogRow {
  id: string;
  user_id: string;
  habit_id: string;
  log_date: string;
  occurred: boolean;
  duration_minutes: number | null;
  notes: string | null;
  logged_at: string;
}

export interface SupabaseLogSummaryRow {
  id: string;
  user_id: string;
  log_date: string;
  xp_earned: number;
  bare_minimum_met: boolean;
  submitted_at: string | null;
  admin_summary: { total: number; completed: number; tasks: { title: string; completed: boolean }[] } | null;
}

export interface SupabaseStreakRow {
  id: string;
  user_id: string;
  habit_id: string;
  current_count: number;
  longest_count: number;
  last_completed_date: string | null;
  streak_started_date: string | null;
  shield_available: boolean;
  shield_used_date: string | null;
}

export interface SupabaseBareMinStreakRow {
  id: string;
  user_id: string;
  current_count: number;
  longest_count: number;
  last_met_date: string | null;
  streak_started_date: string | null;
}

export interface SupabaseUserXpRow {
  id: string;
  user_id: string;
  total_xp: number;
  current_level: number;
}

export interface SupabaseSprintRow {
  id: string;
  user_id: string;
  name: string;
  intensity: string;
  status: string;
  start_date: string;
  deadline: string;
  completed_at: string | null;
  bare_minimum_days_met: number;
  total_sprint_days: number;
  badge_earned: string | null;
}

export interface SupabaseSprintTaskRow {
  id: string;
  sprint_id: string;
  parent_task_id: string | null;
  title: string;
  is_completed: boolean;
  due_date: string | null;
  sort_order: number;
  completed_at: string | null;
}

export interface SupabaseReflectionRow {
  id: string;
  user_id: string;
  reflection_date: string;
  period: string;
  question: string;
  answer: string;
  forward_intention: string | null;
}
