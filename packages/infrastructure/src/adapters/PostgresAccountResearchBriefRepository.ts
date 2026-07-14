import type { IAccountResearchBriefRepository } from "@pulse-brazil/application";
import { type AccountId, AccountResearchBrief, asAccountId } from "@pulse-brazil/domain";
import type { Pool } from "@neondatabase/serverless";

interface AccountResearchBriefRow {
  account_id: string;
  overview: string;
  history: string[];
  competitive_intel: string[];
  retrieved_at: Date;
}

function rowToBrief(row: AccountResearchBriefRow): AccountResearchBrief {
  return AccountResearchBrief.of({
    accountId: asAccountId(row.account_id),
    overview: row.overview,
    history: row.history,
    competitiveIntel: row.competitive_intel,
    retrievedAt: row.retrieved_at,
  });
}

/** Satisfies IAccountResearchBriefRepository. No ORM — plain parameterised SQL against the account_research_briefs table (see migrations/016_create_account_research_briefs.sql, migrations/017_add_overview_to_account_research_briefs.sql). */
export class PostgresAccountResearchBriefRepository implements IAccountResearchBriefRepository {
  constructor(private readonly pool: Pool) {}

  async findByAccountId(accountId: AccountId): Promise<AccountResearchBrief | null> {
    const { rows } = await this.pool.query<AccountResearchBriefRow>(
      "SELECT * FROM account_research_briefs WHERE account_id = $1",
      [accountId],
    );
    const [row] = rows;
    return row ? rowToBrief(row) : null;
  }

  async save(brief: AccountResearchBrief): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO account_research_briefs (account_id, overview, history, competitive_intel, retrieved_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (account_id) DO UPDATE SET
        overview = EXCLUDED.overview,
        history = EXCLUDED.history,
        competitive_intel = EXCLUDED.competitive_intel,
        retrieved_at = EXCLUDED.retrieved_at
      `,
      [brief.accountId, brief.overview, JSON.stringify(brief.history), JSON.stringify(brief.competitiveIntel), brief.retrievedAt],
    );
  }
}
