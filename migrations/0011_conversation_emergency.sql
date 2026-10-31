-- Emergency flag: set when the assistant shows a student the "Call 000"
-- button. Lets the operator console surface these conversations distinctly
-- from ordinary escalations.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS emergency_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emergency_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_conversations_emergency
  ON conversations(emergency_at DESC)
  WHERE emergency_at IS NOT NULL;
