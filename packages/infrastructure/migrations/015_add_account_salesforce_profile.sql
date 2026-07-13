-- Additive Salesforce account-export metadata (see ClientType's domain
-- doc comment for why this is a separate axis from account_type, not a
-- replacement of it). Existing rows default to an empty/null profile —
-- this was never captured by the original account-record CSV import path,
-- which only carried location fields.
ALTER TABLE accounts
  ADD COLUMN client_types JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN account_owner TEXT,
  ADD COLUMN created_cohort_year TEXT,
  ADD COLUMN open_opportunity_count INTEGER;
