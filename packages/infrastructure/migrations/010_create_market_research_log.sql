-- Schema only for now — no port/repository writes to this table yet in this
-- pass (RunMarketResearchSweep persists results as Signals). Ready for a
-- future IMarketResearchLogRepository if a raw per-query audit trail is needed.
CREATE TABLE IF NOT EXISTS market_research_log (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  sources       JSONB NOT NULL DEFAULT '[]',
  retrieved_at  TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_market_research_log_account_id ON market_research_log(account_id);
CREATE INDEX idx_market_research_log_retrieved_at ON market_research_log(retrieved_at DESC);
