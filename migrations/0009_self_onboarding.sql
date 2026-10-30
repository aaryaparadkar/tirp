-- Self-service onboarding over WhatsApp: the student types ONBOARD, is asked
-- for their name, and is onboarded on reply (no operator API call needed).
ALTER TABLE onboarding_state
  ADD COLUMN IF NOT EXISTS student_name TEXT,
  ADD COLUMN IF NOT EXISTS name_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_onboarding_name_pending
ON onboarding_state (contact_id)
WHERE name_requested_at IS NOT NULL;
