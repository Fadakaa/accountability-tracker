-- ============================================================
-- RESEED HABITS — Run this in Supabase SQL Editor
-- This populates the habits + habit_levels tables using the
-- actual auth user's UUID (not the old hardcoded one).
-- ============================================================

-- First, find the authenticated user ID from user_profile
-- (created automatically by the auth trigger on signup)
DO $$
DECLARE
  uid UUID;
BEGIN
  -- Get the user ID from existing data or use the first auth user
  SELECT id INTO uid FROM auth.users LIMIT 1;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'No authenticated user found. Please sign up first.';
  END IF;

  -- Ensure user_profile exists
  INSERT INTO user_profile (id, timezone)
  VALUES (uid, 'Europe/London')
  ON CONFLICT (id) DO NOTHING;

  -- Clear existing habits for this user (fresh start)
  DELETE FROM habit_levels WHERE habit_id IN (SELECT id FROM habits WHERE user_id = uid);
  DELETE FROM habits WHERE user_id = uid;

  -- Binary habits
  INSERT INTO habits (id, user_id, name, slug, category, stack, is_bare_minimum, unit, icon, sort_order) VALUES
    ('10000000-0000-0000-0000-000000000001', uid, 'Prayer',            'prayer',            'binary', 'morning', TRUE,  NULL, '🙏', 1),
    ('10000000-0000-0000-0000-000000000002', uid, 'Bible Reading',     'bible-reading',     'binary', 'morning', TRUE,  NULL, '📖', 2),
    ('10000000-0000-0000-0000-000000000003', uid, 'Journal',           'journal',           'binary', 'morning', TRUE,  NULL, '📓', 3),
    ('10000000-0000-0000-0000-000000000004', uid, 'NSDR / Yoga Nidra', 'meditation',        'binary', 'midday',  TRUE,  NULL, '🧘', 4),
    ('10000000-0000-0000-0000-000000000010', uid, 'Cold Exposure',     'cold-exposure',     'binary', 'morning', TRUE,  NULL, '🧊', 5),
    ('10000000-0000-0000-0000-000000000011', uid, 'Keystone Task',     'keystone-task',     'binary', 'morning', TRUE,  NULL, '🔑', 6),
    ('10000000-0000-0000-0000-000000000005', uid, 'Tidy Up Space',     'tidy',              'binary', 'midday',  TRUE,  NULL, '🏠', 7),
    ('10000000-0000-0000-0000-000000000006', uid, 'Chore',             'chore',             'binary', 'midday',  FALSE, NULL, '🧹', 8),
    ('10000000-0000-0000-0000-000000000007', uid, 'Training',          'training',          'binary', 'evening', TRUE,  NULL, '💪', 9),
    ('10000000-0000-0000-0000-000000000008', uid, 'Reading',           'reading',           'binary', 'evening', TRUE,  NULL, '📚', 10),
    ('10000000-0000-0000-0000-000000000009', uid, 'Meaningful Action', 'meaningful-action', 'binary', 'evening', FALSE, NULL, '🎯', 11);

  -- Measured habits
  INSERT INTO habits (id, user_id, name, slug, category, stack, is_bare_minimum, unit, icon, sort_order) VALUES
    ('20000000-0000-0000-0000-000000000001', uid, 'Bible Chapters',    'bible-chapters',    'measured', 'morning', FALSE, 'count',   '📖', 12),
    ('20000000-0000-0000-0000-000000000002', uid, 'Training Minutes',  'training-minutes',  'measured', 'evening', FALSE, 'minutes', '⏱️', 13),
    ('20000000-0000-0000-0000-000000000003', uid, 'RPE',               'rpe',               'measured', 'evening', FALSE, '1-10',    '📊', 14),
    ('20000000-0000-0000-0000-000000000004', uid, 'Deep Work Blocks',  'deep-work',         'measured', 'midday',  FALSE, 'count',   '🧠', 15),
    ('20000000-0000-0000-0000-000000000005', uid, 'Pages Read',        'pages-read',        'measured', 'evening', FALSE, 'count',   '📄', 16),
    ('20000000-0000-0000-0000-000000000006', uid, 'Environment Score', 'environment-score', 'measured', 'midday',  FALSE, '1-5',     '🏡', 17),
    ('20000000-0000-0000-0000-000000000007', uid, 'Energy Level',      'energy-level',      'measured', 'evening', FALSE, '1-5',     '⚡', 18);

  -- Admin Tasks (measured, auto-populated)
  INSERT INTO habits (id, user_id, name, slug, category, stack, is_bare_minimum, unit, icon, sort_order) VALUES
    ('20000000-0000-0000-0000-000000000010', uid, 'Admin Tasks',       'admin-tasks',       'measured', 'evening', FALSE, 'tasks',   '📋', 19);

  -- Bad habits
  INSERT INTO habits (id, user_id, name, slug, category, stack, is_bare_minimum, unit, icon, sort_order) VALUES
    ('30000000-0000-0000-0000-000000000001', uid, 'League of Legends', 'league',  'bad', 'evening', FALSE, 'minutes', '🎮', 20),
    ('30000000-0000-0000-0000-000000000002', uid, 'Plates Not Washed', 'plates',  'bad', 'evening', FALSE, NULL,      '🍽️', 21),
    ('30000000-0000-0000-0000-000000000003', uid, 'Hygiene Delayed',   'hygiene', 'bad', 'evening', FALSE, NULL,      '🚿', 22);

  -- Habit levels
  INSERT INTO habit_levels (habit_id, level, label, description) VALUES
    -- Prayer
    ('10000000-0000-0000-0000-000000000001', 1, 'Pray (any length)',   'Just pray — any length counts'),
    ('10000000-0000-0000-0000-000000000001', 2, '5 min prayer',        'Pray for at least 5 minutes'),
    ('10000000-0000-0000-0000-000000000001', 3, '10 min prayer',       'Pray for at least 10 minutes'),
    ('10000000-0000-0000-0000-000000000001', 4, 'Journaled prayer',    'Pray and journal your prayer'),
    -- Bible Reading
    ('10000000-0000-0000-0000-000000000002', 1, 'Read 1 verse',        'Read at least 1 verse'),
    ('10000000-0000-0000-0000-000000000002', 2, 'Read 1 chapter',      'Read a full chapter'),
    ('10000000-0000-0000-0000-000000000002', 3, 'Read 2 chapters',     'Read 2 chapters'),
    ('10000000-0000-0000-0000-000000000002', 4, 'Chapter + notes',     'Read a chapter and take notes'),
    -- Journal
    ('10000000-0000-0000-0000-000000000003', 1, 'Write 1 sentence',    'Write at least 1 sentence'),
    ('10000000-0000-0000-0000-000000000003', 2, 'Write 5 min',         'Journal for 5 minutes'),
    ('10000000-0000-0000-0000-000000000003', 3, 'Full page',           'Write a full page'),
    ('10000000-0000-0000-0000-000000000003', 4, 'Reflection + plan',   'Reflect on the day and plan tomorrow'),
    -- NSDR / Meditation
    ('10000000-0000-0000-0000-000000000004', 1, '1 minute',            'Meditate for at least 1 minute'),
    ('10000000-0000-0000-0000-000000000004', 2, '5 minutes',           'Meditate for 5 minutes'),
    ('10000000-0000-0000-0000-000000000004', 3, '10 minutes',          'Meditate for 10 minutes'),
    ('10000000-0000-0000-0000-000000000004', 4, '15+ minutes',         'Meditate for 15 minutes or more'),
    -- Cold Exposure
    ('10000000-0000-0000-0000-000000000010', 1, 'Cold finish',         'End shower with 30s cold'),
    ('10000000-0000-0000-0000-000000000010', 2, '1 min cold',          '1 minute of cold exposure'),
    ('10000000-0000-0000-0000-000000000010', 3, '2 min cold',          '2 minutes of cold exposure'),
    ('10000000-0000-0000-0000-000000000010', 4, '3+ min cold',         '3+ minutes of deliberate cold'),
    -- Keystone Task
    ('10000000-0000-0000-0000-000000000011', 1, 'Identify task',       'Identify your most important task'),
    ('10000000-0000-0000-0000-000000000011', 2, 'Start within 1h',     'Start your keystone within 1 hour of waking'),
    ('10000000-0000-0000-0000-000000000011', 3, 'Complete by noon',    'Complete your keystone task by noon'),
    ('10000000-0000-0000-0000-000000000011', 4, 'Deep work first',     'Do keystone as first deep work block'),
    -- Tidy Up Space
    ('10000000-0000-0000-0000-000000000005', 1, 'Move 1 thing',        'Move or put away 1 thing'),
    ('10000000-0000-0000-0000-000000000005', 2, '15 min reset',        'Do a 15-minute room reset'),
    ('10000000-0000-0000-0000-000000000005', 3, 'Full room',           'Clean an entire room'),
    ('10000000-0000-0000-0000-000000000005', 4, 'Score 4+ daily',      'Maintain an environment score of 4+'),
    -- Training
    ('10000000-0000-0000-0000-000000000007', 1, 'Walk in',             'Just enter the gym / show up'),
    ('10000000-0000-0000-0000-000000000007', 2, '15 min session',      'Train for at least 15 minutes'),
    ('10000000-0000-0000-0000-000000000007', 3, '45+ min session',     'Full session of 45+ minutes'),
    ('10000000-0000-0000-0000-000000000007', 4, 'Full session + log',  'Full session with detailed gym log'),
    -- Training Minutes (measured levels)
    ('20000000-0000-0000-0000-000000000002', 1, 'Any duration',        'Log any training duration'),
    ('20000000-0000-0000-0000-000000000002', 2, '30+ minutes',         'Train for at least 30 minutes'),
    ('20000000-0000-0000-0000-000000000002', 3, '45+ minutes',         'Train for at least 45 minutes'),
    ('20000000-0000-0000-0000-000000000002', 4, '60+ minutes',         'Train for 60+ minutes'),
    -- Reading
    ('10000000-0000-0000-0000-000000000008', 1, 'Read 1 page',         'Read at least 1 page'),
    ('10000000-0000-0000-0000-000000000008', 2, '10 pages',            'Read 10 pages'),
    ('10000000-0000-0000-0000-000000000008', 3, '20 pages',            'Read 20 pages'),
    ('10000000-0000-0000-0000-000000000008', 4, '30+ pages',           'Read 30 or more pages'),
    -- Deep Work
    ('20000000-0000-0000-0000-000000000004', 1, '1 block',             'Complete 1 deep work block (25-50 min)'),
    ('20000000-0000-0000-0000-000000000004', 2, '2 blocks/day',        'Complete 2 deep work blocks in a day'),
    ('20000000-0000-0000-0000-000000000004', 3, '3 blocks/day',        'Complete 3 deep work blocks in a day'),
    ('20000000-0000-0000-0000-000000000004', 4, '3+ blocks + logged',  'Complete 3+ blocks with session notes');

  RAISE NOTICE 'Habits and levels seeded for user %', uid;
END $$;
