-- ============================================================
-- ACCOUNTABILITY TRACKER — SUPABASE DATABASE SCHEMA
-- Phase 1 MVP + foundations for Phase 2/3
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USER PROFILE (solo user, but structured for extensibility)
-- ============================================================
CREATE TABLE user_profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pin_hash TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. HABITS — definition table
-- ============================================================
CREATE TYPE habit_category AS ENUM ('binary', 'measured', 'bad');
CREATE TYPE habit_stack AS ENUM ('morning', 'midday', 'evening');

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category habit_category NOT NULL,
  stack habit_stack NOT NULL,
  is_bare_minimum BOOLEAN NOT NULL DEFAULT FALSE,
  unit TEXT,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  current_level INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. HABIT LEVELS — defines what each level means per habit
-- ============================================================
CREATE TABLE habit_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  level INT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  UNIQUE (habit_id, level)
);

-- ============================================================
-- 4. DAILY LOGS — one row per habit per day
-- ============================================================
CREATE TYPE log_status AS ENUM ('done', 'missed', 'later', 'skipped');

CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  status log_status NOT NULL DEFAULT 'later',
  value NUMERIC,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (habit_id, log_date)
);

CREATE INDEX idx_daily_logs_date ON daily_logs(log_date);
CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, log_date);

-- ============================================================
-- 5. BAD HABIT LOGS
-- ============================================================
CREATE TABLE bad_habit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  occurred BOOLEAN NOT NULL DEFAULT FALSE,
  duration_minutes INT,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (habit_id, log_date)
);

CREATE INDEX idx_bad_habit_logs_date ON bad_habit_logs(log_date);

-- ============================================================
-- 6. STREAKS
-- ============================================================
CREATE TABLE streaks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  current_count INT NOT NULL DEFAULT 0,
  longest_count INT NOT NULL DEFAULT 0,
  last_completed_date DATE,
  streak_started_date DATE,
  shield_available BOOLEAN NOT NULL DEFAULT FALSE,
  shield_used_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, habit_id)
);

CREATE TABLE bare_minimum_streak (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  current_count INT NOT NULL DEFAULT 0,
  longest_count INT NOT NULL DEFAULT 0,
  last_met_date DATE,
  streak_started_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ============================================================
-- 7. XP & LEVELS
-- ============================================================
CREATE TABLE xp_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  reference_id UUID,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_xp_ledger_user ON xp_ledger(user_id);
CREATE INDEX idx_xp_ledger_earned ON xp_ledger(earned_at);

CREATE TABLE user_xp (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  total_xp INT NOT NULL DEFAULT 0,
  current_level INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE levels (
  level INT PRIMARY KEY,
  title TEXT NOT NULL,
  xp_required INT NOT NULL
);

INSERT INTO levels (level, title, xp_required) VALUES
  (1,  'Beginner',           0),
  (2,  'Showing Up',         500),
  (3,  'Building Momentum',  1200),
  (4,  'Forming Habits',     2500),
  (5,  'Consistent',         4500),
  (6,  'Dedicated',          7500),
  (7,  'Disciplined',        11500),
  (8,  'Relentless',         17000),
  (9,  'Atomic',             24000),
  (10, 'Unshakeable',        33000),
  (11, 'Identity Shift',     45000),
  (12, 'The Standard',       60000),
  (13, 'Elite',              80000),
  (14, 'Legendary',          105000),
  (15, 'Transcendent',       140000);

-- ============================================================
-- 8. SPRINT MODE
-- ============================================================
CREATE TYPE sprint_intensity AS ENUM ('moderate', 'intense', 'critical');
CREATE TYPE sprint_status AS ENUM ('active', 'completed', 'cancelled');

CREATE TABLE sprints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  intensity sprint_intensity NOT NULL,
  status sprint_status NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL,
  deadline DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  bare_minimum_days_met INT NOT NULL DEFAULT 0,
  total_sprint_days INT NOT NULL DEFAULT 0,
  badge_earned TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sprint_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sprint_id UUID NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES sprint_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  sort_order INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. WEEKLY / MONTHLY TARGETS
-- ============================================================
CREATE TYPE target_period AS ENUM ('weekly', 'monthly');

CREATE TABLE targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  period target_period NOT NULL,
  target_value NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, metric, period)
);

-- ============================================================
-- 10. REVIEWS & REFLECTIONS
-- ============================================================
CREATE TYPE review_type AS ENUM ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly');

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  review_type review_type NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  xp_earned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE review_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  card_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. NOTIFICATIONS & ESCALATION STATE
-- ============================================================
CREATE TYPE notification_channel AS ENUM ('push', 'sms', 'email', 'whatsapp');
CREATE TYPE escalation_status AS ENUM ('pending', 'escalating', 'resolved', 'auto_missed');

CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  status escalation_status NOT NULL DEFAULT 'pending',
  escalation_step INT NOT NULL DEFAULT 0,
  channels_used notification_channel[] NOT NULL DEFAULT '{push}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_escalation_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  UNIQUE (habit_id, log_date)
);

-- ============================================================
-- 12. MOTIVATIONAL ONE-LINERS
-- ============================================================
CREATE TABLE motivational_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. GYM LOG
-- ============================================================
CREATE TYPE training_type AS ENUM ('gym', 'bjj', 'run', 'rest');

CREATE TABLE gym_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  training_type training_type NOT NULL,
  muscle_group TEXT,
  duration_minutes INT,
  rpe INT CHECK (rpe >= 1 AND rpe <= 10),
  notes TEXT,
  just_walked_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gym_exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE gym_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exercise_id UUID NOT NULL REFERENCES gym_exercises(id) ON DELETE CASCADE,
  set_number INT NOT NULL,
  weight_kg NUMERIC,
  reps INT,
  is_failure BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- 14. NOTIFICATION SETTINGS
-- ============================================================
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  destination TEXT,
  UNIQUE (user_id, channel)
);

CREATE TABLE checkin_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  stack habit_stack NOT NULL,
  checkin_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (user_id, stack)
);

-- ============================================================
-- 15. BADGES / ACHIEVEMENTS
-- ============================================================
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  hint TEXT
);

CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

-- ============================================================
-- 16. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bad_habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bare_minimum_streak ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprint_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivational_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON user_profile FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON habits FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON habit_levels FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON daily_logs FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON bad_habit_logs FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON streaks FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON bare_minimum_streak FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON xp_ledger FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON user_xp FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON sprints FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON sprint_tasks FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON targets FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON reviews FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON review_responses FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON escalations FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON motivational_quotes FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON gym_sessions FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON gym_exercises FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON gym_sets FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON notification_settings FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON checkin_schedule FOR ALL USING (TRUE);
CREATE POLICY "Allow all for authenticated" ON user_badges FOR ALL USING (TRUE);
