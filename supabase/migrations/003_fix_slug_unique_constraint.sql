-- ============================================================
-- 003: Fix habits.slug unique constraint & clean dummy seed data
-- ============================================================
-- Problem: habits.slug was UNIQUE globally, which blocks
-- seeding the same habit slugs for a second user.
-- Fix: Drop the global UNIQUE and add a per-user UNIQUE.
-- Also remove dummy seed user data that conflicts.
-- ============================================================

-- 1. Drop the global unique constraint on slug
ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_slug_key;

-- 2. Add a per-user unique constraint (user_id + slug)
--    so each user can have their own set of habits with the same slugs
ALTER TABLE habits ADD CONSTRAINT habits_user_slug_unique UNIQUE (user_id, slug);

-- 3. Delete dummy seed data that was inserted by NUKE_AND_REBUILD.sql
--    (the dummy user '00000000-...' was never a real auth user)
DELETE FROM habits WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM user_profile WHERE id = '00000000-0000-0000-0000-000000000001';

-- 4. Also fix badges.slug if needed (same global UNIQUE issue)
-- badges is a global lookup table so this is actually fine — leave it.

-- Done! Now seedHabitsForUser can insert habits with matching slugs
-- for the real authenticated user without hitting unique violations.
