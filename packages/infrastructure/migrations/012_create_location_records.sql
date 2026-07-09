-- LocationRecord: the durable, reviewable spatial fact the map reads from.
-- Unlike accounts.office_locations (a JSONB array embedded in the Account
-- aggregate), this is real relational columns plus a PostGIS geography
-- column with a GIST index — accounts.office_locations can only be spatially
-- queried by scanning JSONB, this table can be queried by actual position.
--
-- raw_* columns are exactly what a CSV row said, kept separate from
-- normalized_address so a reviewer can see what a normalization step
-- changed. unverified_*/verified_* coordinates are kept side by side rather
-- than overwritten in place, for the same reason.
--
-- resolved_point is written by the repository (not a trigger) from
-- verified_* if present, else unverified_* — the repository is the only
-- writer of this table today, so that's sufficient; a trigger would be the
-- right hardening if a second writer is ever introduced.
CREATE TABLE location_records (
  id                    TEXT PRIMARY KEY,
  kind                  TEXT NOT NULL,
  label                 TEXT NOT NULL,
  raw_address_line      TEXT,
  raw_city              TEXT,
  raw_state             TEXT,
  raw_postal_code       TEXT,
  raw_country           TEXT,
  normalized_address    TEXT,
  unverified_latitude   DOUBLE PRECISION,
  unverified_longitude  DOUBLE PRECISION,
  verified_latitude     DOUBLE PRECISION,
  verified_longitude    DOUBLE PRECISION,
  verification_state    TEXT NOT NULL,
  review_status         TEXT NOT NULL,
  linked_account_id     TEXT REFERENCES accounts (id),
  linked_signal_id      TEXT REFERENCES signals (id),
  event_date            TIMESTAMPTZ,
  is_primary            BOOLEAN NOT NULL DEFAULT false,
  country_code          TEXT NOT NULL DEFAULT 'BR',
  source_document_id    TEXT NOT NULL REFERENCES documents (id),
  source_row_number     INTEGER NOT NULL,
  review_notes          TEXT,
  resolved_point        geography(Point, 4326),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_location_records_resolved_point ON location_records USING GIST (resolved_point);
CREATE INDEX idx_location_records_linked_account_id ON location_records (linked_account_id);
CREATE INDEX idx_location_records_review_status ON location_records (review_status);
CREATE INDEX idx_location_records_source_document_id ON location_records (source_document_id);
