-- Themes are shared reference data, not owned by any account — standalone table, no FKs.
CREATE TABLE themes (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
