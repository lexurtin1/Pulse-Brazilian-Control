-- One row per account, always overwritten in place by the "Information
-- Sweep" button — account_id is the primary key (not a separate generated
-- id) because there is never more than one live brief per account.
CREATE TABLE account_research_briefs (
  account_id        TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  history           JSONB NOT NULL DEFAULT '[]',
  competitive_intel JSONB NOT NULL DEFAULT '[]',
  retrieved_at      TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
