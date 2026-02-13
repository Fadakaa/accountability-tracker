-- ============================================================
-- MIGRATION 001: Auth RLS Policies + User Trigger
-- Run this in the Supabase SQL editor AFTER running schema.sql
-- ============================================================

-- ============================================================
-- 1. AUTO-CREATE USER PROFILE ON SIGN-UP
-- When a user signs up via Supabase Auth, a row is created in
-- user_profile with their auth.uid() as the primary key.
-- ============================================================
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


-- ============================================================
-- 2. DROP OLD "ALLOW ALL" POLICIES
-- ============================================================
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


-- ============================================================
-- 3. USER-SCOPED RLS POLICIES
-- Each user can only access their own data via auth.uid()
-- ============================================================

-- user_profile: match on id = auth.uid()
CREATE POLICY "Users can manage own profile"
  ON user_profile FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Tables with direct user_id column
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

-- Tables accessed via FK (no direct user_id)
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

-- Global lookup tables — read-only for all authenticated users
-- (levels and badges are shared definitions, not user-specific)
CREATE POLICY "Anyone can read levels"
  ON levels FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Anyone can read badges"
  ON badges FOR SELECT TO authenticated
  USING (TRUE);
