-- Enables real spatial storage/indexing for LocationRecord (see 012). The
-- existing accounts.office_locations JSONB array is untouched by this —
-- coexistence now, reconciliation later (see Phase 1 location-intelligence
-- design notes).
CREATE EXTENSION IF NOT EXISTS postgis;
