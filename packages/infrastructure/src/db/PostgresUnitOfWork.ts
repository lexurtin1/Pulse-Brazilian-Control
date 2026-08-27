import type { IUnitOfWork, UnitOfWorkContext } from "@pulse-brazil/application";
import type { Pool } from "@neondatabase/serverless";
import { PostgresAccountRepository } from "../adapters/PostgresAccountRepository.js";
import { PostgresSignalRepository } from "../adapters/PostgresSignalRepository.js";

/** Neon/Postgres implementation of the application-owned atomic work boundary. */
export class PostgresUnitOfWork implements IUnitOfWork {
  constructor(private readonly pool: Pool) {}

  async execute<T>(operation: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const context: UnitOfWorkContext = {
        accounts: new PostgresAccountRepository(client),
        signals: new PostgresSignalRepository(client),
      };
      const result = await operation(context);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve both failures: callers need the original operation error,
        // while the rollback failure remains available for diagnostics.
        throw new AggregateError([error, rollbackError], "Operation and transaction rollback both failed");
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
