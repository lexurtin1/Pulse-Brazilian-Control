import type { Account, AccountId, Signal } from "@pulse-brazil/domain";

/** Account operations that must participate in the current database transaction. */
export interface ITransactionalAccountRepository {
  /** Protects an Account referenced by a new relationship from concurrent deletion. */
  findByIdForLink(id: AccountId): Promise<Account | null>;
}

/** Repositories scoped to one atomic application operation. */
export interface UnitOfWorkContext {
  accounts: ITransactionalAccountRepository;
  signals: {
    save(signal: Signal): Promise<void>;
  };
}

/**
 * Runs a consistency-sensitive application operation in one transaction.
 * Infrastructure owns transaction mechanics; application use cases own the
 * boundary and decide which writes must succeed or fail together.
 */
export interface IUnitOfWork {
  execute<T>(operation: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
}
