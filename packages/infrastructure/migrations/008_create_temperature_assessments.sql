-- Append-only history: no update/delete, matching the domain's TemperatureAssessment.
CREATE TABLE temperature_assessments (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts (id),
  band          TEXT NOT NULL CHECK (band IN ('Hot', 'Warm', 'Cool', 'Cold')),
  rationale     TEXT NOT NULL,
  evidence      JSONB NOT NULL DEFAULT '[]',
  assessed_at   TIMESTAMPTZ NOT NULL,
  assessed_by   TEXT NOT NULL,
  confidence    NUMERIC NOT NULL,
  next_action   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_temperature_assessments_account_id ON temperature_assessments (account_id);
