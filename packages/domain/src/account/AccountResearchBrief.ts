import type { AccountId } from "../shared/identifiers.js";

/**
 * The "Information Sweep" result for one account — purely factual, no
 * opinion or bias, led by a one-sentence overview of what the company is,
 * then organized into the two sections a Calastone salesperson needs:
 * company history and Calastone-relevant competitive intelligence. Keyed by
 * accountId itself (not its own id) because this is a single
 * replaced-in-place fact sheet, not an append-only log like Insight — every
 * sweep overwrites the previous one for that account. overview may be empty
 * and either section may be empty when nothing substantive was found;
 * that's a valid, final state, not an error.
 */
export class AccountResearchBrief {
  private constructor(
    readonly accountId: AccountId,
    readonly overview: string,
    readonly history: readonly string[],
    readonly competitiveIntel: readonly string[],
    readonly retrievedAt: Date,
  ) {}

  static of(params: {
    accountId: AccountId;
    overview: string;
    history: readonly string[];
    competitiveIntel: readonly string[];
    retrievedAt: Date;
  }): AccountResearchBrief {
    return new AccountResearchBrief(params.accountId, params.overview, params.history, params.competitiveIntel, params.retrievedAt);
  }
}
