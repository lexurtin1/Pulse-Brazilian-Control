import type { IMarketResearchLogRepository, MarketResearchLogEntry } from "@pulse-brazil/application";
import type { Pool } from "@neondatabase/serverless";

/** Satisfies IMarketResearchLogRepository. No ORM — plain parameterised SQL against the market_research_log table (see migrations/010_create_market_research_log.sql, migrations/018_make_market_research_log_account_id_nullable.sql). */
export class PostgresMarketResearchLogRepository implements IMarketResearchLogRepository {
  constructor(private readonly pool: Pool) {}

  async logAttempt(entry: MarketResearchLogEntry): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO market_research_log (id, account_id, question, answer, sources, retrieved_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [entry.id, entry.accountId, entry.question, entry.answer, JSON.stringify(entry.sources), entry.retrievedAt],
    );
  }

  async findMostRecentMarketWide(): Promise<Date | null> {
    const { rows } = await this.pool.query<{ retrieved_at: Date }>(
      "SELECT retrieved_at FROM market_research_log WHERE account_id IS NULL ORDER BY retrieved_at DESC LIMIT 1",
    );
    return rows[0]?.retrieved_at ?? null;
  }
}
