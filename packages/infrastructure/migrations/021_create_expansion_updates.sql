-- ExpansionUpdate: the single running answer to "where are we with Brazil
-- right now" — last contact, next meeting, internal blockers, next actions.
--
-- There is exactly one current update. A document ingest revises it rather
-- than appending a new row (the signals table is already the append-only
-- log), so reads are always "the one row, newest first" and `save` upserts.
--
-- last_contact / next_meeting are JSONB rather than flattened columns
-- because they are optional composites that are always read and written
-- whole; splitting them into six nullable columns would let a half-set
-- meeting exist in the database that the domain would refuse to construct.
--
-- manually_edited_fields is the load-bearing column: a field named here was
-- set by a person, and ExpansionUpdate.applyDraft refuses to overwrite it
-- on the next ingest. Losing this column would silently re-enable Claude
-- clobbering hand-corrected facts.
CREATE TABLE expansion_updates (
  id                     TEXT PRIMARY KEY,
  as_of                  TIMESTAMPTZ NOT NULL,
  headline               TEXT NOT NULL,
  last_contact           JSONB,
  next_meeting           JSONB,
  awaiting_internal      JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_actions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_document_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  origin                 TEXT NOT NULL,
  manually_edited_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expansion_updates_as_of ON expansion_updates (as_of DESC);
