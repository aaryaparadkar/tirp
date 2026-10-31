-- Conversational "find a doctor or clinic": remembers where the student is in
-- the postcode → provider-type exchange. One row per contact, short-lived.
CREATE TABLE IF NOT EXISTS provider_search_state (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('postcode', 'type')),
  postcode TEXT,
  suburb TEXT,
  provider_type TEXT CHECK (provider_type IN ('gp', 'dbc', 'hospital', 'afterhours')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
