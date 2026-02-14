-- ============================================================
-- FIX SCRIPT — Run this after the first script errored
-- This finishes the remaining seed data + migrations
-- ============================================================

-- 9. Initialize streaks (fixed — was missing meditation)
INSERT INTO streaks (user_id, habit_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004'),
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

ALTER TYPE habit_category ADD VALUE IF NOT EXISTS 'manual-skill';

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

-- DONE! Database fully set up.
