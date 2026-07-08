-- linked_account_id is a genuine singular relationship (SourceDocument.linkedAccountId),
-- so it's a real foreign key, unlike Signal's many-valued linked_account_ids.
CREATE TABLE documents (
  id                    TEXT PRIMARY KEY,
  declared_type         TEXT NOT NULL,
  inferred_type         TEXT,
  linked_account_id     TEXT REFERENCES accounts (id),
  linked_theme_ids      JSONB NOT NULL DEFAULT '[]',
  ingestion_state       TEXT NOT NULL,
  extracted_references  JSONB NOT NULL DEFAULT '[]',
  provenance            JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_linked_account_id ON documents (linked_account_id);
