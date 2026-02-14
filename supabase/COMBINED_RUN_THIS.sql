-- ============================================================
-- COMBINED SQL SCRIPT — Run this in Supabase SQL Editor
-- Contains: schema.sql + seed.sql + 001 migration + 002 migration
-- ============================================================

-- ============================================================
-- PART 1: SCHEMA (schema.sql)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USER PROFILE
CREATE TABLE user_profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pin_hash TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. HABITS
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

-- 3. HABIT LEVELS
CREATE TABLE habit_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  level INT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  UNIQUE (habit_id, level)
);

-- 4. DAILY LOGS
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

-- 5. BAD HABIT LOGS
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

-- 6. STREAKS
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

-- 7. XP & LEVELS
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

-- 8. SPRINT MODE
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

-- 9. TARGETS
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

-- 10. REVIEWS
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

-- 11. NOTIFICATIONS & ESCALATION
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

-- 12. MOTIVATIONAL QUOTES
CREATE TABLE motivational_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. GYM LOG
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

-- 14. NOTIFICATION SETTINGS
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

-- 15. BADGES
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

-- 16. ROW LEVEL SECURITY (initial permissive — tightened in migration 001)
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


-- ============================================================
-- PART 2: SEED DATA (seed.sql)
-- ============================================================

-- 1. Create user profile
INSERT INTO user_profile (id, timezone) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Europe/London');

-- 2. Binary habits
INSERT INTO habits (id, user_id, name, slug, category, stack, is_bare_minimum, unit, icon, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Prayer',            'prayer',            'binary', 'morning', TRUE,  NULL, '🙏', 1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Bible Reading',     'bible-reading',     'binary', 'morning', TRUE,  NULL, '📖', 2),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Journal',           'journal',           'binary', 'morning', TRUE,  NULL, '📓', 3),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Meditation',        'meditation',        'binary', 'morning', TRUE,  NULL, '🧘', 4),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Tidy Up Space',     'tidy',              'binary', 'midday',  TRUE,  NULL, '🏠', 5),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Chore',             'chore',             'binary', 'midday',  FALSE, NULL, '🧹', 6),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Training',          'training',          'binary', 'evening', TRUE,  NULL, '💪', 7),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Reading',           'reading',           'binary', 'evening', TRUE,  NULL, '📚', 8),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'Meaningful Action', 'meaningful-action', 'binary', 'evening', FALSE, NULL, '🎯', 9);

-- 3. Measured habits
INSERT INTO habits (id, user_id, name, slug, category, stack, is_bare_minimum, unit, icon, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Bible Chapters',    'bible-chapters',    'measured', 'morning', FALSE, 'count',   '📖', 10),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Training Minutes',  'training-minutes',  'measured', 'evening', FALSE, 'minutes', '⏱️', 11),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'RPE',               'rpe',               'measured', 'evening', FALSE, '1-10',    '📊', 12),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Deep Work Blocks',  'deep-work',         'measured', 'midday',  FALSE, 'count',   '🧠', 13),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Pages Read',        'pages-read',        'measured', 'evening', FALSE, 'count',   '📄', 14),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Environment Score', 'environment-score', 'measured', 'midday',  FALSE, '1-5',     '🏡', 15),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Energy Level',      'energy-level',      'measured', 'evening', FALSE, '1-5',     '⚡', 16);

-- 4. Bad habits
INSERT INTO habits (id, user_id, name, slug, category, stack, is_bare_minimum, unit, icon, sort_order) VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'League of Legends', 'league',  'bad', 'evening', FALSE, 'minutes', '🎮', 17),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Plates Not Washed', 'plates',  'bad', 'evening', FALSE, NULL,      '🍽️', 18),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Hygiene Delayed',   'hygiene', 'bad', 'evening', FALSE, NULL,      '🚿', 19);

-- 5. Habit levels
INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000001', 1, 'Pray (any length)',   'Just pray — any length counts'),
  ('10000000-0000-0000-0000-000000000001', 2, '5 min prayer',        'Pray for at least 5 minutes'),
  ('10000000-0000-0000-0000-000000000001', 3, '10 min prayer',       'Pray for at least 10 minutes'),
  ('10000000-0000-0000-0000-000000000001', 4, 'Journaled prayer',    'Pray and journal your prayer');

INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000002', 1, 'Read 1 verse',        'Read at least 1 verse'),
  ('10000000-0000-0000-0000-000000000002', 2, 'Read 1 chapter',      'Read a full chapter'),
  ('10000000-0000-0000-0000-000000000002', 3, 'Read 2 chapters',     'Read 2 chapters'),
  ('10000000-0000-0000-0000-000000000002', 4, 'Chapter + notes',     'Read a chapter and take notes');

INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000003', 1, 'Write 1 sentence',    'Write at least 1 sentence'),
  ('10000000-0000-0000-0000-000000000003', 2, 'Write 5 min',         'Journal for 5 minutes'),
  ('10000000-0000-0000-0000-000000000003', 3, 'Full page',           'Write a full page'),
  ('10000000-0000-0000-0000-000000000003', 4, 'Reflection + plan',   'Reflect on the day and plan tomorrow');

INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000004', 1, '1 minute',            'Meditate for at least 1 minute'),
  ('10000000-0000-0000-0000-000000000004', 2, '5 minutes',           'Meditate for 5 minutes'),
  ('10000000-0000-0000-0000-000000000004', 3, '10 minutes',          'Meditate for 10 minutes'),
  ('10000000-0000-0000-0000-000000000004', 4, '15+ minutes',         'Meditate for 15 minutes or more');

INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000005', 1, 'Move 1 thing',        'Move or put away 1 thing'),
  ('10000000-0000-0000-0000-000000000005', 2, '15 min reset',        'Do a 15-minute room reset'),
  ('10000000-0000-0000-0000-000000000005', 3, 'Full room',           'Clean an entire room'),
  ('10000000-0000-0000-0000-000000000005', 4, 'Score 4+ daily',      'Maintain an environment score of 4+');

INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000007', 1, 'Walk in',             'Just enter the gym / show up'),
  ('10000000-0000-0000-0000-000000000007', 2, '15 min session',      'Train for at least 15 minutes'),
  ('10000000-0000-0000-0000-000000000007', 3, '45+ min session',     'Full session of 45+ minutes'),
  ('10000000-0000-0000-0000-000000000007', 4, 'Full session + log',  'Full session with detailed gym log');

INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000008', 1, 'Read 1 page',         'Read at least 1 page'),
  ('10000000-0000-0000-0000-000000000008', 2, '10 pages',            'Read 10 pages'),
  ('10000000-0000-0000-0000-000000000008', 3, '20 pages',            'Read 20 pages'),
  ('10000000-0000-0000-0000-000000000008', 4, '30+ pages',           'Read 30 or more pages');

INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('20000000-0000-0000-0000-000000000004', 1, '1 block',             'Complete 1 deep work block (25-50 min)'),
  ('20000000-0000-0000-0000-000000000004', 2, '2 blocks/day',        'Complete 2 deep work blocks in a day'),
  ('20000000-0000-0000-0000-000000000004', 3, '3 blocks/day',        'Complete 3 deep work blocks in a day'),
  ('20000000-0000-0000-0000-000000000004', 4, '3+ blocks + logged',  'Complete 3+ blocks with session notes');

-- 6. Weekly targets
INSERT INTO targets (user_id, metric, period, target_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'training_sessions', 'weekly',  5),
  ('00000000-0000-0000-0000-000000000001', 'deep_work_blocks',  'weekly',  15),
  ('00000000-0000-0000-0000-000000000001', 'bible_chapters',    'weekly',  7),
  ('00000000-0000-0000-0000-000000000001', 'pages_read',        'weekly',  70);

-- 7. Monthly targets
INSERT INTO targets (user_id, metric, period, target_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'training_sessions', 'monthly', 20),
  ('00000000-0000-0000-0000-000000000001', 'bible_chapters',    'monthly', 30),
  ('00000000-0000-0000-0000-000000000001', 'books_finished',    'monthly', 2);

-- 8. Check-in schedule
INSERT INTO checkin_schedule (user_id, stack, checkin_time) VALUES
  ('00000000-0000-0000-0000-000000000001', 'morning', '07:00'),
  ('00000000-0000-0000-0000-000000000001', 'midday',  '13:00'),
  ('00000000-0000-0000-0000-000000000001', 'evening', '21:00');

-- 9. Initialize streaks
INSERT INTO streaks (user_id, habit_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000008');

INSERT INTO bare_minimum_streak (user_id) VALUES
  ('00000000-0000-0000-0000-000000000001');

-- 10. Initialize XP
INSERT INTO user_xp (user_id, total_xp, current_level) VALUES
  ('00000000-0000-0000-0000-000000000001', 0, 1);

-- 11. Motivational quotes
INSERT INTO motivational_quotes (user_id, quote) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Did I cast votes today for the man I want to be?'),
  ('00000000-0000-0000-0000-000000000001', 'What is the smallest action that keeps the streak alive?'),
  ('00000000-0000-0000-0000-000000000001', 'If today repeats for 365 days, where do I end up?'),
  ('00000000-0000-0000-0000-000000000001', 'Bad days still count if the minimum is met.'),
  ('00000000-0000-0000-0000-000000000001', 'Small actions. Ruthless consistency.'),
  ('00000000-0000-0000-0000-000000000001', 'I don''t negotiate with the plan — I execute it.'),
  ('00000000-0000-0000-0000-000000000001', 'Discipline first. Motivation follows.'),
  ('00000000-0000-0000-0000-000000000001', 'Progress beats perfection — every time.'),
  ('00000000-0000-0000-0000-000000000001', 'The system protects me from my moods.'),
  ('00000000-0000-0000-0000-000000000001', 'This is automatic — no debate.'),
  ('00000000-0000-0000-0000-000000000001', 'I only need to start. Momentum will carry me.'),
  ('00000000-0000-0000-0000-000000000001', 'Indecision is the initiation of procrastination. Choose and move.'),
  ('00000000-0000-0000-0000-000000000001', 'One small action keeps the identity alive.'),
  ('00000000-0000-0000-0000-000000000001', 'I can do hard things even when I don''t feel like it.'),
  ('00000000-0000-0000-0000-000000000001', 'Do it now. Relief later.'),
  ('00000000-0000-0000-0000-000000000001', 'Finish the rep. Finish the set. Finish the day.'),
  ('00000000-0000-0000-0000-000000000001', 'If I do the minimum, I protect the streak and protect the future.');

-- 12. Badges
INSERT INTO badges (slug, name, description, category, icon, is_hidden, hint) VALUES
  ('first_day',          'First Day',              'Logged your first day',                      'consistency', '🏁', FALSE, 'Log your first day'),
  ('streak_7',           '7-Day Streak',           'Maintained a 7-day streak on any habit',     'consistency', '🔥', FALSE, 'Keep a streak for 7 days'),
  ('streak_14',          '14-Day Streak',          'Maintained a 14-day streak on any habit',    'consistency', '⚡', FALSE, 'Keep a streak for 14 days'),
  ('streak_30',          '30-Day Streak',          'Maintained a 30-day streak on any habit',    'consistency', '💎', FALSE, 'Keep a streak for 30 days'),
  ('streak_60',          '60-Day Streak',          'Maintained a 60-day streak on any habit',    'consistency', '⭐', FALSE, 'Keep a streak for 60 days'),
  ('streak_90',          '90-Day Streak',          'Maintained a 90-day streak on any habit',    'consistency', '👑', FALSE, 'Keep a streak for 90 days'),
  ('streak_365',         'The Identity',           'Maintained a 365-day streak on any habit',   'consistency', '🏆', FALSE, 'Keep a streak for a full year'),
  ('never_miss_twice',   'Never Miss Twice',       'Recovered a broken streak within 24 hours',  'consistency', '🔄', FALSE, 'Get back on track within 24 hours'),
  ('bible_100',          '100 Bible Chapters',     'Read 100 Bible chapters',                    'volume', '📖', FALSE, 'Read 100 total chapters'),
  ('training_1000',      '1,000 Training Minutes', 'Logged 1,000 training minutes',              'volume', '💪', FALSE, 'Log 1,000 minutes of training'),
  ('deep_work_50',       '50 Deep Work Blocks',    'Completed 50 deep work blocks',              'volume', '🧠', FALSE, 'Complete 50 deep work blocks'),
  ('prayers_100',        '100 Prayers',            'Logged 100 prayer sessions',                  'volume', '🙏', FALSE, 'Pray 100 times'),
  ('xp_10000',           '10,000 XP',              'Earned 10,000 total XP',                      'volume', '⚔️', FALSE, 'Earn 10,000 XP'),
  ('xp_50000',           '50,000 XP',              'Earned 50,000 total XP',                      'volume', '🛡️', FALSE, 'Earn 50,000 XP'),
  ('perfect_week',       'Perfect Week',           'All weekly targets met',                      'special', '🌟', FALSE, 'Meet all weekly targets'),
  ('perfect_month',      'Perfect Month',          'All monthly targets met',                     'special', '🏅', FALSE, 'Meet all monthly targets'),
  ('bad_day_champion',   'Bad Day Champion',       'Hit bare minimum on a day rated energy 1/5',  'special', '🦸', FALSE, 'Hit bare minimum on your worst day'),
  ('bare_minimum_hero',  'Bare Minimum Hero',      '30 days in a row of bare minimum met',        'special', '🛡️', FALSE, 'Hit bare minimum 30 days straight'),
  ('clean_week',         'Clean Week',             'Zero bad habits for 7 days',                  'special', '✨', FALSE, 'Go a full week with zero bad habits'),
  ('level_up_accepted',  'Level Up Accepted',      'Raised a bare minimum threshold',             'special', '📈', FALSE, 'Accept a level-up suggestion'),
  ('the_comeback',       'The Comeback',           'Logged after 7+ days of silence',             'special', '🦅', FALSE, 'Return after a break'),
  ('iron_will',          'Iron Will',              'Completed routine after marking everything Later', 'special', '⚔️', FALSE, 'Complete everything you deferred'),
  ('dawn_warrior',       'Dawn Warrior',           'Morning stack before 7:30 AM for 7 days',     'special', '🌅', FALSE, 'Complete morning stack early, 7 days straight'),
  ('the_observer',       'The Observer',           'Honestly logged a bad habit 30 times',         'special', '👁️', FALSE, 'Log bad habits honestly 30 times'),
  ('sprint_survivor',    'Sprint Survivor',        'Maintained bare minimum >80% during a sprint', 'sprint', '🚀', FALSE, 'Survive a sprint with bare minimum'),
  ('under_fire',         'Under Fire',             'Maintained bare minimum during Critical sprint','sprint', '🔥', FALSE, 'Complete a Critical intensity sprint'),
  ('unbreakable_sprint', 'Unbreakable',            'Maintained ALL streaks through a sprint',      'sprint', '🛡️', FALSE, 'Keep all streaks alive during a sprint'),
  ('sprint_master',      'Sprint Master',          'Completed all sprint tasks AND bare minimum',  'sprint', '👑', FALSE, 'Complete a sprint perfectly'),
  ('ghost',              'Ghost',                  'Returned after 14+ days of silence',           'hidden', '👻', TRUE,  NULL),
  ('200_iq',             '200 IQ',                 'Exceeded all targets in a single week',        'hidden', '🧠', TRUE,  NULL),
  ('the_machine',        'The Machine',            'Full month, zero Later responses',             'hidden', '🤖', TRUE,  NULL),
  ('first_wrap',         'First Wrap',             'Completed your first weekly review',           'review', '📊', FALSE, 'Complete your first weekly wrap'),
  ('consistent_reviewer','Consistent Reviewer',    'Completed 4 weekly wraps in a row',            'review', '📋', FALSE, 'Complete 4 weekly wraps consecutively'),
  ('monthly_ritual',     'Monthly Ritual',         'Completed 3 monthly wraps in a row',           'review', '📅', FALSE, 'Complete 3 monthly wraps consecutively'),
  ('quarter_chronicler', 'Quarter Chronicler',     'Completed a quarterly wrap',                   'review', '📚', FALSE, 'Complete a quarterly review'),
  ('year_one',           'Year One',               'Completed a full yearly wrap',                 'review', '🎆', FALSE, 'Complete your first yearly review'),
  ('the_reflector',      'The Reflector',          'Answered 50 reflection questions',             'review', '💬', FALSE, 'Answer 50 reflection questions'),
  ('pattern_spotter',    'Pattern Spotter',        'Completed 12 weekly wraps',                    'review', '🔍', FALSE, 'Complete 12 weekly reviews'),
  ('full_accountant',    'Full Accountant',        'Weekly + monthly + quarterly with zero missed', 'review', '📊', FALSE, 'Never miss a review');


-- ============================================================
-- PART 3: MIGRATION 001 — Auth RLS Policies
-- ============================================================

-- Auto-create user profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profile (id, timezone)
  VALUES (NEW.id, 'Europe/London');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop permissive policies
DROP POLICY IF EXISTS "Allow all for authenticated" ON user_profile;
DROP POLICY IF EXISTS "Allow all for authenticated" ON habits;
DROP POLICY IF EXISTS "Allow all for authenticated" ON habit_levels;
DROP POLICY IF EXISTS "Allow all for authenticated" ON daily_logs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON bad_habit_logs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON streaks;
DROP POLICY IF EXISTS "Allow all for authenticated" ON bare_minimum_streak;
DROP POLICY IF EXISTS "Allow all for authenticated" ON xp_ledger;
DROP POLICY IF EXISTS "Allow all for authenticated" ON user_xp;
DROP POLICY IF EXISTS "Allow all for authenticated" ON sprints;
DROP POLICY IF EXISTS "Allow all for authenticated" ON sprint_tasks;
DROP POLICY IF EXISTS "Allow all for authenticated" ON targets;
DROP POLICY IF EXISTS "Allow all for authenticated" ON reviews;
DROP POLICY IF EXISTS "Allow all for authenticated" ON review_responses;
DROP POLICY IF EXISTS "Allow all for authenticated" ON escalations;
DROP POLICY IF EXISTS "Allow all for authenticated" ON motivational_quotes;
DROP POLICY IF EXISTS "Allow all for authenticated" ON gym_sessions;
DROP POLICY IF EXISTS "Allow all for authenticated" ON gym_exercises;
DROP POLICY IF EXISTS "Allow all for authenticated" ON gym_sets;
DROP POLICY IF EXISTS "Allow all for authenticated" ON notification_settings;
DROP POLICY IF EXISTS "Allow all for authenticated" ON checkin_schedule;
DROP POLICY IF EXISTS "Allow all for authenticated" ON user_badges;

-- User-scoped RLS policies
CREATE POLICY "Users can manage own profile"
  ON user_profile FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can manage own habits"
  ON habits FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own daily logs"
  ON daily_logs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own bad habit logs"
  ON bad_habit_logs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own streaks"
  ON streaks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own bare minimum streak"
  ON bare_minimum_streak FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own xp ledger"
  ON xp_ledger FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own xp"
  ON user_xp FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own sprints"
  ON sprints FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own targets"
  ON targets FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own reviews"
  ON reviews FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own escalations"
  ON escalations FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own quotes"
  ON motivational_quotes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own gym sessions"
  ON gym_sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own notification settings"
  ON notification_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own checkin schedule"
  ON checkin_schedule FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own badges"
  ON user_badges FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own habit levels"
  ON habit_levels FOR ALL
  USING (habit_id IN (SELECT id FROM habits WHERE user_id = auth.uid()))
  WITH CHECK (habit_id IN (SELECT id FROM habits WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own sprint tasks"
  ON sprint_tasks FOR ALL
  USING (sprint_id IN (SELECT id FROM sprints WHERE user_id = auth.uid()))
  WITH CHECK (sprint_id IN (SELECT id FROM sprints WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own review responses"
  ON review_responses FOR ALL
  USING (review_id IN (SELECT id FROM reviews WHERE user_id = auth.uid()))
  WITH CHECK (review_id IN (SELECT id FROM reviews WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own gym exercises"
  ON gym_exercises FOR ALL
  USING (session_id IN (SELECT id FROM gym_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM gym_sessions WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own gym sets"
  ON gym_sets FOR ALL
  USING (exercise_id IN (SELECT id FROM gym_exercises WHERE session_id IN (SELECT id FROM gym_sessions WHERE user_id = auth.uid())))
  WITH CHECK (exercise_id IN (SELECT id FROM gym_exercises WHERE session_id IN (SELECT id FROM gym_sessions WHERE user_id = auth.uid())));

CREATE POLICY "Anyone can read levels"
  ON levels FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Anyone can read badges"
  ON badges FOR SELECT TO authenticated
  USING (TRUE);


-- ============================================================
-- PART 4: MIGRATION 002 — Sync Tables
-- ============================================================

-- Add manual-skill to habit_category enum
ALTER TYPE habit_category ADD VALUE IF NOT EXISTS 'manual-skill';

-- User settings
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

-- Admin tasks
CREATE TABLE admin_tasks (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  task_date DATE,
  source TEXT NOT NULL DEFAULT 'adhoc',
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

-- Gym routines
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

-- App usage stats
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

-- Daily log summaries
CREATE TABLE daily_log_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  xp_earned INT NOT NULL DEFAULT 0,
  bare_minimum_met BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ,
  admin_summary JSONB,
  UNIQUE (user_id, log_date)
);

CREATE INDEX idx_log_summaries_user_date ON daily_log_summaries(user_id, log_date);

ALTER TABLE daily_log_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own log summaries"
  ON daily_log_summaries FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Wrap reflections
CREATE TABLE wrap_reflections (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  reflection_date DATE NOT NULL,
  period TEXT NOT NULL,
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


-- ============================================================
-- DONE! All tables, seed data, RLS policies, and sync tables created.
-- ============================================================
