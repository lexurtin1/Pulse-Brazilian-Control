-- AccountCountSnapshot: a point-in-time count of Active accounts, captured
-- immediately after each Location CSV upload (see
-- claude/INTEGRATION_PLAN.md Feature 2). Account.status is mutable current
-- state, unlike Deal rows, so the count can't be reconstructed
-- retroactively from the accounts table alone — it has to be captured and
-- persisted at the moment it's true.
CREATE TABLE account_count_snapshots (
  id                  TEXT PRIMARY KEY,
  count               INTEGER NOT NULL,
  as_of               TIMESTAMPTZ NOT NULL,
  source_document_id  TEXT REFERENCES documents (id)
);

CREATE INDEX idx_account_count_snapshots_as_of ON account_count_snapshots (as_of DESC);

-- One-time backfill: account data already exists (44 real offices
-- backfilled into accounts prior to this feature) with no historical
-- snapshot to diff against. Insert one row now from the current count so
-- the very next Location CSV upload already has a "previous" to compare
-- against, instead of this card going delta-less until the upload after
-- that. source_document_id is NULL — this row has no triggering upload.
INSERT INTO account_count_snapshots (id, count, as_of, source_document_id)
SELECT 'backfill-active-accounts-2026-07-13', COUNT(*), now(), NULL
FROM accounts
WHERE status = 'Active';
