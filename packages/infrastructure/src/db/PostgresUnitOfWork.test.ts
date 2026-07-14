import type { Pool, PoolClient } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";
import { PostgresUnitOfWork } from "./PostgresUnitOfWork.js";

function transactionDouble(options?: { rollbackFails?: boolean }): {
  pool: Pool;
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string) => {
    if (sql === "ROLLBACK" && options?.rollbackFails) throw new Error("rollback failed");
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, query, release };
}

describe("PostgresUnitOfWork", () => {
  it("commits successful work and releases the client", async () => {
    const { pool, query, release } = transactionDouble();
    const unitOfWork = new PostgresUnitOfWork(pool);

    await expect(unitOfWork.execute(async () => "done")).resolves.toBe("done");

    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls failed work back, releases the client, and preserves the operation error", async () => {
    const { pool, query, release } = transactionDouble();
    const unitOfWork = new PostgresUnitOfWork(pool);
    const failure = new Error("write failed");

    await expect(unitOfWork.execute(async () => { throw failure; })).rejects.toBe(failure);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("reports both failures when rollback also fails", async () => {
    const { pool, release } = transactionDouble({ rollbackFails: true });
    const unitOfWork = new PostgresUnitOfWork(pool);

    await expect(unitOfWork.execute(async () => { throw new Error("write failed"); })).rejects.toThrow(
      "Operation and transaction rollback both failed",
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
