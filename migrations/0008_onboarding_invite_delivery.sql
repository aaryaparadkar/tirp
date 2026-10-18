ALTER TABLE onboarding_state
  ADD COLUMN quiz_invite_claimed_at TIMESTAMPTZ,
  ADD COLUMN quiz_invite_delivery_error TEXT;

CREATE INDEX idx_onboarding_ready_invitation
ON onboarding_state (quiz_due_at)
WHERE quiz_due_at IS NOT NULL
  AND arrival_quiz_started_at IS NULL
  AND quiz_invite_sent_at IS NULL
  AND quiz_invite_claimed_at IS NULL
  AND quiz_invite_opted_in_at IS NOT NULL
  AND quiz_invite_opted_out_at IS NULL;
