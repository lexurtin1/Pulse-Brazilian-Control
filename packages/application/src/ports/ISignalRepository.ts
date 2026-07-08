import type { AccountId, Signal, SignalId } from "@pulse-brazil/domain";

export interface ISignalRepository {
  findById(id: SignalId): Promise<Signal | null>;
  findByAccountId(accountId: AccountId): Promise<Signal[]>;
  /** Most recent signals across all accounts, newest first — powers the time-first feed. */
  findRecent(limit: number): Promise<Signal[]>;
  save(signal: Signal): Promise<void>;
}
