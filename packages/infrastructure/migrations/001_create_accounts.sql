-- The Account aggregate, persisted whole: office locations (with their nested
-- coordinates) and external references are JSONB arrays rather than separate
-- tables, since they're owned entirely within the Account aggregate boundary.
CREATE TABLE accounts (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  account_type          TEXT NOT NULL,
  status                TEXT NOT NULL,
  geographic_scope      JSONB NOT NULL,
  office_locations      JSONB NOT NULL DEFAULT '[]',
  linked_theme_ids      JSONB NOT NULL DEFAULT '[]',
  linked_signal_ids     JSONB NOT NULL DEFAULT '[]',
  -- Full embedded TemperatureAssessment snapshot — ListAccounts reads this
  -- directly with no join. The authoritative history lives in
  -- temperature_assessments (see 008).
  latest_temperature    JSONB,
  -- Denormalized from latest_temperature->>'band' for filtering/indexing
  -- without unpacking JSONB.
  temperature_band      TEXT CHECK (temperature_band IN ('Hot', 'Warm', 'Cool', 'Cold')),
  external_references   JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_temperature_band ON accounts (temperature_band);
