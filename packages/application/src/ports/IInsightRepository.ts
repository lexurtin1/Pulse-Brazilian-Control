import type { AccountId, Insight, InsightId } from "@pulse-brazil/domain";

export interface IInsightRepository {
  findById(id: InsightId): Promise<Insight | null>;
  findByAccountId(accountId: AccountId): Promise<Insight[]>;
  findLatestForAccount(accountId: AccountId): Promise<Insight | null>;
  save(insight: Insight): Promise<void>;
}
