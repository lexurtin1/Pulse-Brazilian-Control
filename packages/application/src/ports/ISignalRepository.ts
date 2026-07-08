import type { AccountId, Signal, SignalId } from "@pulse-brazil/domain";

export interface ISignalRepository {
  findById(id: SignalId): Promise<Signal | null>;
  findByAccountId(accountId: AccountId): Promise<Signal[]>;
  save(signal: Signal): Promise<void>;
}
