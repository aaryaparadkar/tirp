-- Self-service onboarding now asks for the arrival date after the name.
-- arrival_requested_at marks that open question (cleared once answered).
ALTER TABLE onboarding_state
  ADD COLUMN IF NOT EXISTS arrival_requested_at TIMESTAMPTZ;
