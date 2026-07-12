-- account_office_locations: PostGIS-backed shadow of accounts.office_locations,
-- the expand phase of an expand-contract migration (issue #6).
--
-- accounts.office_locations JSONB stays the domain's source of truth.
-- This table exists for the same reason location_records.resolved_point
-- does (see 012): JSONB can only be spatially queried by scanning every
-- row with jsonb_array_elements; this table is GIST-indexed and queryable
-- by actual position. It's a derived, write-only-from-the-app's-perspective
-- structure — PostgresAccountRepository recomputes it in full on every
-- save() rather than patching incrementally, mirroring how
-- PostgresLocationRecordRepository treats resolved_point. Reads never
-- rehydrate an OfficeLocation from this table.
--
-- id is the office location's own id (OfficeLocationId) — globally unique
-- (IIdGenerator.newId() in application flows, or deterministic
-- `office-${accountSlug}` slugs in seed.ts) — so it doubles as this
-- table's primary key and the natural target for delete-then-reinsert.
--
-- A row is written for every office, including ones with no resolved
-- coordinate yet (point IS NULL) — an office can exist and be flagged
-- primary while still pending geocoding, and that needs to stay
-- crash-consistent with the JSONB. Spatial queries filter on
-- `point IS NOT NULL`.
CREATE TABLE account_office_locations (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  point       geography(Point, 4326),
  is_primary  BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_office_locations_point ON account_office_locations USING GIST (point);
CREATE INDEX idx_account_office_locations_account_id ON account_office_locations (account_id);

-- Backfill: one row per existing office, point computed with the same
-- verified-else-unverified precedence as OfficeLocation.bestAvailableCoordinate.
-- Runs inside the same transaction run-migrations.ts wraps this file in, so
-- it's atomic with the CREATE TABLE above.
INSERT INTO account_office_locations (id, account_id, point, is_primary, created_at, updated_at)
SELECT
  office->>'id' AS id,
  accounts.id AS account_id,
  CASE
    WHEN (office->'verifiedCoordinate'->>'longitude') IS NOT NULL
     AND (office->'verifiedCoordinate'->>'latitude') IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(
        (office->'verifiedCoordinate'->>'longitude')::double precision,
        (office->'verifiedCoordinate'->>'latitude')::double precision
      ), 4326)::geography
    WHEN (office->'unverifiedCoordinate'->>'longitude') IS NOT NULL
     AND (office->'unverifiedCoordinate'->>'latitude') IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(
        (office->'unverifiedCoordinate'->>'longitude')::double precision,
        (office->'unverifiedCoordinate'->>'latitude')::double precision
      ), 4326)::geography
    ELSE NULL
  END AS point,
  (office->>'isPrimary')::boolean AS is_primary,
  accounts.created_at,
  accounts.updated_at
FROM accounts, jsonb_array_elements(accounts.office_locations) AS office;
