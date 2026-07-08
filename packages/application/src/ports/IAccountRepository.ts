import type { Account, AccountId } from "@pulse-brazil/domain";

/** Persistence contract for the Account aggregate. No implementation here — infrastructure provides one (Postgres, in-memory for tests, etc.). */
export interface IAccountRepository {
  findById(id: AccountId): Promise<Account | null>;
  findAll(): Promise<Account[]>;
  save(account: Account): Promise<void>;
  delete(id: AccountId): Promise<void>;
}
