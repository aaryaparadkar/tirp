-- One active quiz session per contact: concurrent triggers serialize on this
-- index instead of creating duplicate sessions. The loser of a simultaneous
-- insert resumes the winner's session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_sessions_single_active
  ON quiz_sessions(contact_id) WHERE status = 'active';
