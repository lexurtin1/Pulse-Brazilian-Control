-- primary_account_id is denormalized from the first Account-kind entry in
-- related_entities (GenerateInsight always guarantees at least one), so
-- findByAccountId / findLatestForAccount can use a plain indexed lookup
-- instead of a JSONB containment scan over related_entities.
CREATE TABLE insights (
  id                    TEXT PRIMARY KEY,
  summary               TEXT NOT NULL,
  why_it_matters        TEXT NOT NULL,
  related_entities      JSONB NOT NULL,
  evidence              JSONB NOT NULL,
  confidence            NUMERIC NOT NULL,
  origin                JSONB NOT NULL,
  generated_at          TIMESTAMPTZ NOT NULL,
  recommended_action    JSONB,
  primary_account_id    TEXT REFERENCES accounts (id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insights_primary_account_id ON insights (primary_account_id);
