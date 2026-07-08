-- ContextBundle is a value-heavy read model — stored as a single JSONB
-- column (assembledAt, evidence, subjectAccountId) rather than normalized columns.
CREATE TABLE context_bundles (
  id            TEXT PRIMARY KEY,
  data          JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
