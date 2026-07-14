import type { AccountId, Signal, SignalId, SignalType } from "@pulse-brazil/domain";

export interface ISignalRepository {
  findById(id: SignalId): Promise<Signal | null>;
  findByAccountId(accountId: AccountId): Promise<Signal[]>;
  /** Most recent signals across all accounts, newest first — powers the time-first feed. */
  findRecent(limit: number): Promise<Signal[]>;
  /** Newest signal of a given type, or null if none exists yet — lets the market sweep tell Perplexity what it already knew last time. */
  findMostRecentByType(type: SignalType): Promise<Signal | null>;
  save(signal: Signal): Promise<void>;
  /** Permanently deletes every signal — backs the live feed's "Clear feed" button. */
  deleteAll(): Promise<void>;
}
