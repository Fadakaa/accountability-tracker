// Supabase database types — will be auto-generated later via `supabase gen types`
// For now, manual type definitions matching our schema

export type HabitCategory = "binary" | "measured" | "bad" | "manual-skill";

/** Categories that behave like binary in check-in (Done/Miss/Later) */
export function isBinaryLike(category: HabitCategory): boolean {
  return category === "binary" || category === "manual-skill";
}
export type HabitStack = "morning" | "midday" | "evening";
export type LogStatus = "done" | "missed" | "later" | "skipped";
export type SprintIntensity = "moderate" | "intense" | "critical";
export type SprintStatus = "active" | "completed" | "cancelled";
export type TargetPeriod = "weekly" | "monthly";
export type ReviewType =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "yearly";
export type NotificationChannel = "push" | "sms" | "email" | "whatsapp";
export type EscalationStatus =
  | "pending"
  | "escalating"
  | "resolved"
  | "auto_missed";
export type TrainingType = "gym" | "bjj" | "run" | "rest";

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  category: HabitCategory;
  stack: HabitStack;
  is_bare_minimum: boolean;
  unit: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  current_level: number;
  created_at: string;
  updated_at: string;
}

export interface HabitLevel {
  id: string;
  habit_id: string;
  level: number;
  label: string;
  description: string | null;
}

export interface DailyLog {
  id: string;
  user_id: string;
  habit_id: string;
  log_date: string;
  status: LogStatus;
  value: number | null;
  notes: string | null;
  logged_at: string;
}

export interface BadHabitLog {
  id: string;
  user_id: string;
  habit_id: string;
  log_date: string;
  occurred: boolean;
  duration_minutes: number | null;
  notes: string | null;
  logged_at: string;
}

export interface Streak {
  id: string;
  user_id: string;
  habit_id: string;
  current_count: number;
  longest_count: number;
  last_completed_date: string | null;
  streak_started_date: string | null;
  shield_available: boolean;
  shield_used_date: string | null;
  updated_at: string;
}

export interface BareMinimumStreak {
  id: string;
  user_id: string;
  current_count: number;
  longest_count: number;
  last_met_date: string | null;
  streak_started_date: string | null;
  updated_at: string;
}

export interface UserXP {
  id: string;
  user_id: string;
  total_xp: number;
  current_level: number;
  updated_at: string;
}

export interface XPLedgerEntry {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  reference_id: string | null;
  earned_at: string;
}

export interface Level {
  level: number;
  title: string;
  xp_required: number;
}

export interface Sprint {
  id: string;
  user_id: string;
  name: string;
  intensity: SprintIntensity;
  status: SprintStatus;
  start_date: string;
  deadline: string;
  completed_at: string | null;
  bare_minimum_days_met: number;
  total_sprint_days: number;
  badge_earned: string | null;
  created_at: string;
  updated_at: string;
}

export interface SprintTask {
  id: string;
  sprint_id: string;
  parent_task_id: string | null;
  title: string;
  is_completed: boolean;
  due_date: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
}

export interface Target {
  id: string;
  user_id: string;
  metric: string;
  period: TargetPeriod;
  target_value: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  review_type: ReviewType;
  period_start: string;
  period_end: string;
  completed: boolean;
  completed_at: string | null;
  xp_earned: number;
  created_at: string;
}

export interface ReviewResponse {
  id: string;
  review_id: string;
  question: string;
  answer: string | null;
  card_type: string | null;
  created_at: string;
}

export interface MotivationalQuote {
  id: string;
  user_id: string;
  quote: string;
  is_active: boolean;
  created_at: string;
}

export interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  is_hidden: boolean;
  hint: string | null;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
}

export interface GymSession {
  id: string;
  user_id: string;
  session_date: string;
  training_type: TrainingType;
  muscle_group: string | null;
  duration_minutes: number | null;
  rpe: number | null;
  notes: string | null;
  just_walked_in: boolean;
  created_at: string;
}

export interface GymExercise {
  id: string;
  session_id: string;
  exercise_name: string;
  sort_order: number;
}

export interface GymSet {
  id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  is_failure: boolean;
}

// ─── New tables for Supabase sync (002 migration) ──────

export interface UserSettings_DB {
  id: string;
  user_id: string;
  settings_json: Record<string, unknown>;
  updated_at: string;
}

export interface AdminTask_DB {
  id: string;
  user_id: string;
  title: string;
  completed: boolean;
  task_date: string | null;
  source: string;
  in_backlog: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface GymRoutine_DB {
  id: string;
  user_id: string;
  name: string;
  training_type: TrainingType;
  muscle_group: string | null;
  created_at: string;
  updated_at: string;
}

export interface GymRoutineExercise_DB {
  id: string;
  routine_id: string;
  exercise_name: string;
  default_sets: number;
  sort_order: number;
}

export interface AppUsageStats {
  id: string;
  user_id: string;
  total_opens: number;
  unique_days: number;
  last_open_date: string | null;
  first_open_date: string | null;
}

export interface DailyLogSummary {
  id: string;
  user_id: string;
  log_date: string;
  xp_earned: number;
  bare_minimum_met: boolean;
  submitted_at: string | null;
  admin_summary: Record<string, unknown> | null;
}

export interface WrapReflection_DB {
  id: string;
  user_id: string;
  reflection_date: string;
  period: string;
  question: string;
  answer: string;
  forward_intention: string | null;
  created_at: string;
}

// Placeholder Database type for Supabase client generic
// Replace with auto-generated types from `supabase gen types typescript`
export type Database = {
  public: {
    Tables: {
      habits: { Row: Habit; Insert: Partial<Habit>; Update: Partial<Habit> };
      daily_logs: {
        Row: DailyLog;
        Insert: Partial<DailyLog>;
        Update: Partial<DailyLog>;
      };
      bad_habit_logs: {
        Row: BadHabitLog;
        Insert: Partial<BadHabitLog>;
        Update: Partial<BadHabitLog>;
      };
      streaks: {
        Row: Streak;
        Insert: Partial<Streak>;
        Update: Partial<Streak>;
      };
      user_xp: {
        Row: UserXP;
        Insert: Partial<UserXP>;
        Update: Partial<UserXP>;
      };
      xp_ledger: {
        Row: XPLedgerEntry;
        Insert: Partial<XPLedgerEntry>;
        Update: Partial<XPLedgerEntry>;
      };
      levels: { Row: Level; Insert: Partial<Level>; Update: Partial<Level> };
      sprints: {
        Row: Sprint;
        Insert: Partial<Sprint>;
        Update: Partial<Sprint>;
      };
      sprint_tasks: {
        Row: SprintTask;
        Insert: Partial<SprintTask>;
        Update: Partial<SprintTask>;
      };
      targets: {
        Row: Target;
        Insert: Partial<Target>;
        Update: Partial<Target>;
      };
      reviews: {
        Row: Review;
        Insert: Partial<Review>;
        Update: Partial<Review>;
      };
      review_responses: {
        Row: ReviewResponse;
        Insert: Partial<ReviewResponse>;
        Update: Partial<ReviewResponse>;
      };
      motivational_quotes: {
        Row: MotivationalQuote;
        Insert: Partial<MotivationalQuote>;
        Update: Partial<MotivationalQuote>;
      };
      badges: { Row: Badge; Insert: Partial<Badge>; Update: Partial<Badge> };
      user_badges: {
        Row: UserBadge;
        Insert: Partial<UserBadge>;
        Update: Partial<UserBadge>;
      };
      gym_sessions: {
        Row: GymSession;
        Insert: Partial<GymSession>;
        Update: Partial<GymSession>;
      };
      gym_exercises: {
        Row: GymExercise;
        Insert: Partial<GymExercise>;
        Update: Partial<GymExercise>;
      };
      gym_sets: {
        Row: GymSet;
        Insert: Partial<GymSet>;
        Update: Partial<GymSet>;
      };
      // ─── New tables from 002 migration ─────
      user_settings: {
        Row: UserSettings_DB;
        Insert: Partial<UserSettings_DB>;
        Update: Partial<UserSettings_DB>;
      };
      admin_tasks: {
        Row: AdminTask_DB;
        Insert: Partial<AdminTask_DB>;
        Update: Partial<AdminTask_DB>;
      };
      gym_routines: {
        Row: GymRoutine_DB;
        Insert: Partial<GymRoutine_DB>;
        Update: Partial<GymRoutine_DB>;
      };
      gym_routine_exercises: {
        Row: GymRoutineExercise_DB;
        Insert: Partial<GymRoutineExercise_DB>;
        Update: Partial<GymRoutineExercise_DB>;
      };
      app_usage_stats: {
        Row: AppUsageStats;
        Insert: Partial<AppUsageStats>;
        Update: Partial<AppUsageStats>;
      };
      daily_log_summaries: {
        Row: DailyLogSummary;
        Insert: Partial<DailyLogSummary>;
        Update: Partial<DailyLogSummary>;
      };
      wrap_reflections: {
        Row: WrapReflection_DB;
        Insert: Partial<WrapReflection_DB>;
        Update: Partial<WrapReflection_DB>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      habit_category: HabitCategory;
      habit_stack: HabitStack;
      log_status: LogStatus;
      sprint_intensity: SprintIntensity;
      sprint_status: SprintStatus;
      target_period: TargetPeriod;
      review_type: ReviewType;
      notification_channel: NotificationChannel;
      escalation_status: EscalationStatus;
      training_type: TrainingType;
    };
  };
};
