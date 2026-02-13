-- ============================================================
-- MIGRATION 002: Additional Tables for Supabase Sync
-- Run AFTER schema.sql, 001_auth_rls_policies.sql, and seed.sql
-- ============================================================

-- ============================================================
-- 1. ADD manual-skill TO habit_category ENUM
-- TypeScript has 'manual-skill' but the DB enum only had binary|measured|bad
-- ============================================================
ALTER TYPE habit_category ADD VALUE IF NOT EXISTS 'manual-skill';

-- ============================================================
-- 2. USER_SETTINGS — Full UserSettings blob as JSONB
-- Stores: habitOverrides, levelUpStates, checkinTimes,
--         notificationSlots, customQuotes, hiddenQuoteIds,
--         routineChains, customHabits
-- One row per user. JSONB keeps the shape identical to localStorage.
-- ============================================================
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own settings"
  ON user_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 3. ADMIN_TASKS — Daily to-do items with backlog
-- ============================================================
CREATE TABLE admin_tasks (
  id TEXT PRIMARY KEY,              -- client-generated: admin-{timestamp}-{random}
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  task_date DATE,                   -- NULL for backlog-only items
  source TEXT NOT NULL DEFAULT 'adhoc',  -- 'adhoc', 'planned', 'backlog'
  in_backlog BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_tasks_user_date ON admin_tasks(user_id, task_date);

ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own admin tasks"
  ON admin_tasks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 4. GYM_ROUTINES — Saved workout templates
-- ============================================================
CREATE TABLE gym_routines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  training_type training_type NOT NULL,
  muscle_group TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gym_routines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own gym routines"
  ON gym_routines FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE gym_routine_exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  routine_id UUID NOT NULL REFERENCES gym_routines(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  default_sets INT NOT NULL DEFAULT 3,
  sort_order INT NOT NULL DEFAULT 0
);

ALTER TABLE gym_routine_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own routine exercises"
  ON gym_routine_exercises FOR ALL
  USING (routine_id IN (SELECT id FROM gym_routines WHERE user_id = auth.uid()))
  WITH CHECK (routine_id IN (SELECT id FROM gym_routines WHERE user_id = auth.uid()));

-- ============================================================
-- 5. APP_USAGE_STATS — "You Keep Showing Up" counter
-- ============================================================
CREATE TABLE app_usage_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  total_opens INT NOT NULL DEFAULT 0,
  unique_days INT NOT NULL DEFAULT 0,
  last_open_date DATE,
  first_open_date DATE,
  UNIQUE (user_id)
);

ALTER TABLE app_usage_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own usage stats"
  ON app_usage_stats FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 6. DAILY_LOG_SUMMARIES — Per-day aggregate metadata
-- The normalized daily_logs table has one row per habit per day,
-- but the app also stores per-day aggregates: xpEarned,
-- bareMinimumMet, submittedAt, adminSummary.
-- ============================================================
CREATE TABLE daily_log_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  xp_earned INT NOT NULL DEFAULT 0,
  bare_minimum_met BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ,
  admin_summary JSONB,            -- {total, completed, tasks[]}
  UNIQUE (user_id, log_date)
);

CREATE INDEX idx_log_summaries_user_date ON daily_log_summaries(user_id, log_date);

ALTER TABLE daily_log_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own log summaries"
  ON daily_log_summaries FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 7. WRAP_REFLECTIONS — Weekly/monthly wrap-up responses
-- Currently embedded in LocalState.reflections array
-- ============================================================
CREATE TABLE wrap_reflections (
  id TEXT PRIMARY KEY,              -- client-generated UUID
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  reflection_date DATE NOT NULL,
  period TEXT NOT NULL,             -- 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  forward_intention TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reflections_user_date ON wrap_reflections(user_id, reflection_date);

ALTER TABLE wrap_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own reflections"
  ON wrap_reflections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
