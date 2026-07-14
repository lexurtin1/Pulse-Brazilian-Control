-- One-sentence "what is this company" summary, shown first in the
-- Information Sweep brief, ahead of history and competitive intel.
ALTER TABLE account_research_briefs ADD COLUMN overview TEXT NOT NULL DEFAULT '';
