-- ============================================================
-- SEED DATA — Michael's default configuration
-- Run after schema.sql
-- ============================================================

-- 1. Create user profile
INSERT INTO user_profile (id, timezone) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Europe/London');

-- 2. Binary habits (9 total, 7 bare minimum)
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

-- 5. Habit levels (adaptive bare minimum progression)
-- Prayer
INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000001', 1, 'Pray (any length)',   'Just pray — any length counts'),
  ('10000000-0000-0000-0000-000000000001', 2, '5 min prayer',        'Pray for at least 5 minutes'),
  ('10000000-0000-0000-0000-000000000001', 3, '10 min prayer',       'Pray for at least 10 minutes'),
  ('10000000-0000-0000-0000-000000000001', 4, 'Journaled prayer',    'Pray and journal your prayer');

-- Bible Reading
INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000002', 1, 'Read 1 verse',        'Read at least 1 verse'),
  ('10000000-0000-0000-0000-000000000002', 2, 'Read 1 chapter',      'Read a full chapter'),
  ('10000000-0000-0000-0000-000000000002', 3, 'Read 2 chapters',     'Read 2 chapters'),
  ('10000000-0000-0000-0000-000000000002', 4, 'Chapter + notes',     'Read a chapter and take notes');

-- Journal
INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000003', 1, 'Write 1 sentence',    'Write at least 1 sentence'),
  ('10000000-0000-0000-0000-000000000003', 2, 'Write 5 min',         'Journal for 5 minutes'),
  ('10000000-0000-0000-0000-000000000003', 3, 'Full page',           'Write a full page'),
  ('10000000-0000-0000-0000-000000000003', 4, 'Reflection + plan',   'Reflect on the day and plan tomorrow');

-- Meditation
INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000004', 1, '1 minute',            'Meditate for at least 1 minute'),
  ('10000000-0000-0000-0000-000000000004', 2, '5 minutes',           'Meditate for 5 minutes'),
  ('10000000-0000-0000-0000-000000000004', 3, '10 minutes',          'Meditate for 10 minutes'),
  ('10000000-0000-0000-0000-000000000004', 4, '15+ minutes',         'Meditate for 15 minutes or more');

-- Tidy Up Space
INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000005', 1, 'Move 1 thing',        'Move or put away 1 thing'),
  ('10000000-0000-0000-0000-000000000005', 2, '15 min reset',        'Do a 15-minute room reset'),
  ('10000000-0000-0000-0000-000000000005', 3, 'Full room',           'Clean an entire room'),
  ('10000000-0000-0000-0000-000000000005', 4, 'Score 4+ daily',      'Maintain an environment score of 4+');

-- Training
INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000007', 1, 'Walk in',             'Just enter the gym / show up'),
  ('10000000-0000-0000-0000-000000000007', 2, '15 min session',      'Train for at least 15 minutes'),
  ('10000000-0000-0000-0000-000000000007', 3, '45+ min session',     'Full session of 45+ minutes'),
  ('10000000-0000-0000-0000-000000000007', 4, 'Full session + log',  'Full session with detailed gym log');

-- Reading
INSERT INTO habit_levels (habit_id, level, label, description) VALUES
  ('10000000-0000-0000-0000-000000000008', 1, 'Read 1 page',         'Read at least 1 page'),
  ('10000000-0000-0000-0000-000000000008', 2, '10 pages',            'Read 10 pages'),
  ('10000000-0000-0000-0000-000000000008', 3, '20 pages',            'Read 20 pages'),
  ('10000000-0000-0000-0000-000000000008', 4, '30+ pages',           'Read 30 or more pages');

-- Deep Work
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

-- 8. Default check-in schedule (UK times)
INSERT INTO checkin_schedule (user_id, stack, checkin_time) VALUES
  ('00000000-0000-0000-0000-000000000001', 'morning', '07:00'),
  ('00000000-0000-0000-0000-000000000001', 'midday',  '13:00'),
  ('00000000-0000-0000-0000-000000000001', 'evening', '21:00');

-- 9. Initialize streaks for all trackable habits
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

-- 11. Motivational one-liners
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

-- 12. Seed badges (all from spec)
INSERT INTO badges (slug, name, description, category, icon, is_hidden, hint) VALUES
  -- Consistency badges
  ('first_day',          'First Day',              'Logged your first day',                      'consistency', '🏁', FALSE, 'Log your first day'),
  ('streak_7',           '7-Day Streak',           'Maintained a 7-day streak on any habit',     'consistency', '🔥', FALSE, 'Keep a streak for 7 days'),
  ('streak_14',          '14-Day Streak',          'Maintained a 14-day streak on any habit',    'consistency', '⚡', FALSE, 'Keep a streak for 14 days'),
  ('streak_30',          '30-Day Streak',          'Maintained a 30-day streak on any habit',    'consistency', '💎', FALSE, 'Keep a streak for 30 days'),
  ('streak_60',          '60-Day Streak',          'Maintained a 60-day streak on any habit',    'consistency', '⭐', FALSE, 'Keep a streak for 60 days'),
  ('streak_90',          '90-Day Streak',          'Maintained a 90-day streak on any habit',    'consistency', '👑', FALSE, 'Keep a streak for 90 days'),
  ('streak_365',         'The Identity',           'Maintained a 365-day streak on any habit',   'consistency', '🏆', FALSE, 'Keep a streak for a full year'),
  ('never_miss_twice',   'Never Miss Twice',       'Recovered a broken streak within 24 hours',  'consistency', '🔄', FALSE, 'Get back on track within 24 hours'),

  -- Volume badges
  ('bible_100',          '100 Bible Chapters',     'Read 100 Bible chapters',                    'volume', '📖', FALSE, 'Read 100 total chapters'),
  ('training_1000',      '1,000 Training Minutes', 'Logged 1,000 training minutes',              'volume', '💪', FALSE, 'Log 1,000 minutes of training'),
  ('deep_work_50',       '50 Deep Work Blocks',    'Completed 50 deep work blocks',              'volume', '🧠', FALSE, 'Complete 50 deep work blocks'),
  ('prayers_100',        '100 Prayers',            'Logged 100 prayer sessions',                  'volume', '🙏', FALSE, 'Pray 100 times'),
  ('xp_10000',           '10,000 XP',              'Earned 10,000 total XP',                      'volume', '⚔️', FALSE, 'Earn 10,000 XP'),
  ('xp_50000',           '50,000 XP',              'Earned 50,000 total XP',                      'volume', '🛡️', FALSE, 'Earn 50,000 XP'),

  -- Special badges
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

  -- Sprint badges
  ('sprint_survivor',    'Sprint Survivor',        'Maintained bare minimum >80% during a sprint', 'sprint', '🚀', FALSE, 'Survive a sprint with bare minimum'),
  ('under_fire',         'Under Fire',             'Maintained bare minimum during Critical sprint','sprint', '🔥', FALSE, 'Complete a Critical intensity sprint'),
  ('unbreakable_sprint', 'Unbreakable',            'Maintained ALL streaks through a sprint',      'sprint', '🛡️', FALSE, 'Keep all streaks alive during a sprint'),
  ('sprint_master',      'Sprint Master',          'Completed all sprint tasks AND bare minimum',  'sprint', '👑', FALSE, 'Complete a sprint perfectly'),

  -- Hidden badges
  ('ghost',              'Ghost',                  'Returned after 14+ days of silence',           'hidden', '👻', TRUE,  NULL),
  ('200_iq',             '200 IQ',                 'Exceeded all targets in a single week',        'hidden', '🧠', TRUE,  NULL),
  ('the_machine',        'The Machine',            'Full month, zero Later responses',             'hidden', '🤖', TRUE,  NULL),

  -- Review badges
  ('first_wrap',         'First Wrap',             'Completed your first weekly review',           'review', '📊', FALSE, 'Complete your first weekly wrap'),
  ('consistent_reviewer','Consistent Reviewer',    'Completed 4 weekly wraps in a row',            'review', '📋', FALSE, 'Complete 4 weekly wraps consecutively'),
  ('monthly_ritual',     'Monthly Ritual',         'Completed 3 monthly wraps in a row',           'review', '📅', FALSE, 'Complete 3 monthly wraps consecutively'),
  ('quarter_chronicler', 'Quarter Chronicler',     'Completed a quarterly wrap',                   'review', '📚', FALSE, 'Complete a quarterly review'),
  ('year_one',           'Year One',               'Completed a full yearly wrap',                 'review', '🎆', FALSE, 'Complete your first yearly review'),
  ('the_reflector',      'The Reflector',          'Answered 50 reflection questions',             'review', '💬', FALSE, 'Answer 50 reflection questions'),
  ('pattern_spotter',    'Pattern Spotter',        'Completed 12 weekly wraps',                    'review', '🔍', FALSE, 'Complete 12 weekly reviews'),
  ('full_accountant',    'Full Accountant',        'Weekly + monthly + quarterly with zero missed', 'review', '📊', FALSE, 'Never miss a review');
