CREATE TABLE onboarding_state (
  contact_id TEXT PRIMARY KEY
    REFERENCES contacts(id) ON DELETE CASCADE,

  purchase_event_key TEXT NOT NULL UNIQUE,

  travel_date DATE,
  quiz_due_at TIMESTAMPTZ,

  welcome_sent_at TIMESTAMPTZ,
  travel_date_received_at TIMESTAMPTZ,
  arrival_quiz_started_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_quiz_due
ON onboarding_state (quiz_due_at)
WHERE quiz_due_at IS NOT NULL
  AND arrival_quiz_started_at IS NULL;
