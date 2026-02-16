-- ============================================================
-- 005: Add consequence-aware fields to admin_tasks
-- ============================================================
-- Adds due_date, consequence, and severity columns so tasks
-- can carry stakes (what happens if you don't do this?).
-- ============================================================

-- 1. Due date — optional deadline for the task
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS due_date TEXT;

-- 2. Consequence — free-text describing what happens if missed
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS consequence TEXT;

-- 3. Severity — impact level: low | medium | high | critical
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS severity TEXT
  CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical'));

-- Done! These columns are all optional (nullable) so existing
-- tasks continue to work without modification.
