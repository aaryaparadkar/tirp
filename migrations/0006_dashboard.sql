-- Phase 3 dashboard data model.
--
-- Adds explicit conversation records (status, handling mode, unread state,
-- conversation-level intent) on top of the implicit contacts/messages model,
-- an audit trail, trigger execution storage, ratings, and the operator
-- session tables behind the dashboard auth boundary.

-- --------------------------------------------------------------- operators
CREATE TABLE IF NOT EXISTS dashboard_operators (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('viewer', 'operator', 'supervisor', 'admin')),
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES dashboard_operators(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_operator ON dashboard_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expires ON dashboard_sessions(expires_at);

-- ------------------------------------------------------------ conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'awaiting_contact', 'needs_review', 'resolved', 'failed')),
  handling_mode TEXT NOT NULL DEFAULT 'ai'
    CHECK (handling_mode IN ('ai', 'human', 'escalated')),
  current_intent TEXT,
  original_intent TEXT,
  intent_changed_by TEXT,
  intent_changed_at TIMESTAMPTZ,
  first_message_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  last_message_id TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  has_error BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_handling ON conversations(handling_mode, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_intent ON conversations(current_intent, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id, last_activity_at DESC);

-- --------------------------------------------- conversation_messages deltas
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS author_type TEXT;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS author_id TEXT;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS client_tag TEXT;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS delivery_status TEXT;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS failure_note TEXT;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS source_urls JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
  ON conversation_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_created
  ON conversation_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_error
  ON conversation_messages(error_code, created_at DESC);

-- Idempotency: a retried operator send with the same client tag is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_client_tag
  ON conversation_messages(conversation_id, client_tag)
  WHERE client_tag IS NOT NULL;

-- ------------------------------------------------------- conversation audit
CREATE TABLE IF NOT EXISTS conversation_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  previous_value JSONB,
  next_value JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation
  ON conversation_events(conversation_id, created_at DESC);

-- --------------------------------------------------------- trigger storage
CREATE TABLE IF NOT EXISTS trigger_executions (
  id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL,
  operator_id TEXT,
  conversation_id TEXT,
  target_phone_hash TEXT,
  target_masked TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'rejected')),
  request_json JSONB NOT NULL DEFAULT '{}',
  result_json JSONB,
  error_code TEXT,
  error_message TEXT,
  idempotency_key TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trigger_executions_idempotency
  ON trigger_executions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trigger_executions_started ON trigger_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trigger_executions_trigger ON trigger_executions(trigger_id, started_at DESC);

-- ----------------------------------------------------------------- ratings
CREATE TABLE IF NOT EXISTS conversation_ratings (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_ratings_conversation
  ON conversation_ratings(conversation_id, created_at DESC);

-- ------------------------------------------------- shared rate-limit store
CREATE TABLE IF NOT EXISTS dashboard_rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
