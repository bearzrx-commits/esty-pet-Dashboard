-- Etsy OAuth 令牌存储表
-- 在 Supabase SQL Editor 中执行此 SQL
CREATE TABLE IF NOT EXISTS etsy_oauth_tokens (
  id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 添加索引以加速查询
CREATE INDEX IF NOT EXISTS idx_etsy_oauth_tokens_created ON etsy_oauth_tokens(created_at DESC);
