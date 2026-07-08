-- linked_account_ids is many-valued (a Signal can name several accounts), so
-- it stays JSONB rather than a foreign key — there is no single "the"
-- account a signal belongs to.
CREATE TABLE signals (
  id                  TEXT PRIMARY KEY,
  source              TEXT NOT NULL,
  type                TEXT NOT NULL,
  title               TEXT NOT NULL,
  summary             TEXT NOT NULL,
  linked_account_ids  JSONB NOT NULL DEFAULT '[]',
  linked_theme_ids    JSONB NOT NULL DEFAULT '[]',
  geographic_scope    JSONB,
  date_observed       TIMESTAMPTZ NOT NULL,
  evidence            JSONB NOT NULL DEFAULT '[]',
  confidence          NUMERIC NOT NULL,
  origin              TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
