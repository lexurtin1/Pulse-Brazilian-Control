import type { MarketResearchSource } from "./IMarketResearchService.js";

/** One row per topic asked, whether or not it produced a new Signal — the raw audit trail GetDashboardFreshness reads to know the sweep is actually running, independent of whether it found anything new to report. */
export interface MarketResearchLogEntry {
  id: string;
  /** null for the market-wide sweep (RunMarketResearchSweep) — its topics aren't scoped to a single account. Set for a future per-account research audit trail. */
  accountId: string | null;
  question: string;
  answer: string;
  sources: readonly MarketResearchSource[];
  retrievedAt: Date;
}

export interface IMarketResearchLogRepository {
  logAttempt(entry: MarketResearchLogEntry): Promise<void>;
  /** Most recent retrievedAt among market-wide (account_id IS NULL) log entries, or null if the sweep has never run. */
  findMostRecentMarketWide(): Promise<Date | null>;
}
