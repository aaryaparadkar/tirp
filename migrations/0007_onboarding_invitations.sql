ALTER TABLE onboarding_state
  ADD COLUMN quiz_invite_opted_in_at TIMESTAMPTZ,
  ADD COLUMN quiz_invite_opted_out_at TIMESTAMPTZ,
  ADD COLUMN quiz_invite_sent_at TIMESTAMPTZ;
