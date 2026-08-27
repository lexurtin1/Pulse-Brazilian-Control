-- Account–Signal is one canonical many-to-many relationship. Backfill from
-- Signal.linked_account_ids, which was explicitly the authoritative side of
-- the former mirrored JSON representation, then remove both JSON copies.
CREATE TABLE account_signals (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  signal_id  TEXT NOT NULL REFERENCES signals (id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, signal_id)
);

INSERT INTO account_signals (account_id, signal_id)
SELECT DISTINCT linked.account_id, signal.id
FROM signals AS signal
CROSS JOIN LATERAL jsonb_array_elements_text(signal.linked_account_ids) AS linked(account_id);

CREATE INDEX idx_account_signals_signal_id ON account_signals (signal_id);

ALTER TABLE accounts DROP COLUMN linked_signal_ids;
ALTER TABLE signals DROP COLUMN linked_account_ids;
