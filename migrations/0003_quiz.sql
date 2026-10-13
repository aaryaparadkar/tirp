ALTER TABLE contacts ADD COLUMN quiz_opted_in BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE user_quiz_state (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  earned_question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_sessions INTEGER NOT NULL DEFAULT 0,
  next_reminder_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  last_reminded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz_sessions (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  question_ids JSONB NOT NULL,
  current_index INTEGER NOT NULL DEFAULT 0,
  earned_xp INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_quiz_sessions_active ON quiz_sessions(contact_id, status, created_at DESC);
CREATE INDEX idx_quiz_reminders_due ON user_quiz_state(next_reminder_at);
