-- Deal: one Salesforce opportunity row from a Pipeline CSV upload, verbatim.
-- There is no separate "PipelineSnapshot" table — a snapshot is simply "the
-- deals whose source_document_id points at a given PipelineDataset
-- document," and that document's created_at is the snapshot's "as of" time
-- (see documents.provenance.uploadedAt / claude/INTEGRATION_PLAN.md Feature 1).
--
-- account_name_raw is kept distinct from linked_account_id for the same
-- reason location_records keeps raw_* separate from normalized_address: a
-- reviewer should be able to see what the export actually said even after
-- (or absent) an account link.
CREATE TABLE deals (
  id                    TEXT PRIMARY KEY,
  source_document_id    TEXT NOT NULL REFERENCES documents (id),
  source_row_number     INTEGER NOT NULL,
  opportunity_owner     TEXT,
  account_name_raw      TEXT NOT NULL,
  opportunity_name      TEXT NOT NULL,
  stage                 TEXT NOT NULL,
  fiscal_period         TEXT NOT NULL DEFAULT '',
  amount                NUMERIC(14, 2) NOT NULL,
  expected_revenue      NUMERIC(14, 2) NOT NULL,
  probability_percent   NUMERIC(5, 2) NOT NULL,
  age_days              DOUBLE PRECISION,
  revenue_live_date     TIMESTAMPTZ,
  next_step_summary     TEXT,
  lead_source           TEXT,
  type                  TEXT,
  owner_region          TEXT,
  linked_account_id     TEXT REFERENCES accounts (id),
  review_status         TEXT NOT NULL,
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_source_document_id ON deals (source_document_id);
CREATE INDEX idx_deals_linked_account_id ON deals (linked_account_id);
CREATE INDEX idx_deals_stage ON deals (stage);
