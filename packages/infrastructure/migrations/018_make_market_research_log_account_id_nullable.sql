-- market_research_log was originally scoped for per-account research
-- audits, but the market-wide sweep (RunMarketResearchSweep) has no single
-- account to attach a run to — a null account_id means "market-wide, not
-- account-scoped".
ALTER TABLE market_research_log ALTER COLUMN account_id DROP NOT NULL;
