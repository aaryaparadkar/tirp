CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  wa_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL DEFAULT '',
  intent TEXT,
  source_ids JSONB NOT NULL DEFAULT '[]',
  llm_model TEXT,
  llm_key_slot INTEGER,
  latency_ms INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_contact ON conversation_messages(contact_id, created_at);
