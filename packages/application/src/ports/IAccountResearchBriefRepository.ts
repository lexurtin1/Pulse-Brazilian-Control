import type { AccountId, AccountResearchBrief } from "@pulse-brazil/domain";

/** One row per account — save() always replaces whatever was there before, never appends. */
export interface IAccountResearchBriefRepository {
  findByAccountId(accountId: AccountId): Promise<AccountResearchBrief | null>;
  save(brief: AccountResearchBrief): Promise<void>;
}
