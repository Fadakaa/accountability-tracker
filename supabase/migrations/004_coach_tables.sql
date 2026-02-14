-- ============================================================
-- 004: AI Coach tables — API keys, conversations, experiments
-- ============================================================

-- 1. Secure API key storage (RLS: only the user can read their own)
CREATE TABLE IF NOT EXISTS coach_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,              -- 'anthropic' | 'openai' | 'google'
  api_key_encrypted TEXT NOT NULL,     -- stored as-is (RLS protects access)
  model TEXT,                          -- e.g. 'claude-sonnet-4-20250514', 'gpt-4o-mini'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE coach_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own API keys" ON coach_api_keys
  FOR ALL USING (user_id = auth.uid());

-- 2. Coach conversations & analyses
CREATE TABLE IF NOT EXISTS coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',  -- [{role, content, timestamp}]
  summary TEXT,                          -- AI-generated summary of conversation
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conversations" ON coach_conversations
  FOR ALL USING (user_id = auth.uid());

-- 3. Experiments (coach-suggested actions to try)
CREATE TABLE IF NOT EXISTS coach_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scale TEXT NOT NULL DEFAULT 'small',       -- 'small' | 'medium' | 'large'
  complexity TEXT NOT NULL DEFAULT 'simple',  -- 'simple' | 'complex'
  status TEXT NOT NULL DEFAULT 'suggested',   -- 'suggested' | 'active' | 'completed' | 'skipped'
  duration_days INTEGER DEFAULT 5,
  start_date TEXT,
  end_date TEXT,
  outcome TEXT,              -- user's reflection on result
  coach_analysis TEXT,       -- AI's analysis of the experiment result
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE coach_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own experiments" ON coach_experiments
  FOR ALL USING (user_id = auth.uid());

-- Done! Run this in the Supabase SQL editor to create the coach tables.
