-- TemperatureAssessment history is the sole source of truth. Preserve any
-- legacy Account snapshot that is unexpectedly absent from the history table,
-- then remove both Account-side copies of the current value.
INSERT INTO temperature_assessments (
  id, account_id, band, rationale, evidence, assessed_at, assessed_by,
  confidence, next_action
)
SELECT
  account.latest_temperature->>'id',
  account.id,
  account.latest_temperature->>'band',
  account.latest_temperature->>'rationale',
  COALESCE(account.latest_temperature->'evidence', '[]'::jsonb),
  (account.latest_temperature->>'assessedAt')::timestamptz,
  account.latest_temperature->>'assessedBy',
  (account.latest_temperature->>'confidence')::numeric,
  NULLIF(account.latest_temperature->>'nextAction', '')
FROM accounts AS account
WHERE account.latest_temperature IS NOT NULL
ON CONFLICT (id) DO NOTHING;

DROP INDEX idx_accounts_temperature_band;
ALTER TABLE accounts DROP COLUMN latest_temperature;
ALTER TABLE accounts DROP COLUMN temperature_band;

DROP INDEX idx_temperature_assessments_account_id;
CREATE INDEX idx_temperature_assessments_latest
  ON temperature_assessments (account_id, assessed_at DESC, created_at DESC, id DESC);
