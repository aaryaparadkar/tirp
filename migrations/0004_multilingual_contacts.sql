ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS preferred_language TEXT
CHECK (preferred_language IN ('en', 'zh-CN', 'es'));

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS language_detected_at TIMESTAMPTZ;

ALTER TABLE conversation_messages
ADD COLUMN IF NOT EXISTS language TEXT;
