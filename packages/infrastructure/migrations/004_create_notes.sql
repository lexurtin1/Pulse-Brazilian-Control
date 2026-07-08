CREATE TABLE notes (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts (id),
  note_type     TEXT NOT NULL,
  content       TEXT NOT NULL,
  authored_by   TEXT NOT NULL,
  authored_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_account_id ON notes (account_id);
