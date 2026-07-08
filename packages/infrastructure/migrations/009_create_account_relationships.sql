-- Schema only for now — AccountRelationship has no port in the application
-- layer yet (not part of this pass's required repositories). Table exists
-- so a future IAccountRelationshipRepository has somewhere to land.
CREATE TABLE account_relationships (
  id                  TEXT PRIMARY KEY,
  from_account_id     TEXT NOT NULL REFERENCES accounts (id),
  to_account_id       TEXT NOT NULL REFERENCES accounts (id),
  relationship_type   TEXT NOT NULL,
  rationale           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_relationships_from_account_id ON account_relationships (from_account_id);
CREATE INDEX idx_account_relationships_to_account_id ON account_relationships (to_account_id);
