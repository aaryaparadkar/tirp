-- After self-service onboarding the bot asks "opt into the quiz?".
-- quiz_prompted_at marks that open question (cleared once answered).
ALTER TABLE onboarding_state
  ADD COLUMN IF NOT EXISTS quiz_prompted_at TIMESTAMPTZ;
