import type { Pool } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";
import { asAccountId } from "@pulse-brazil/domain";
import { PostgresAccountRepository } from "./PostgresAccountRepository.js";

describe("PostgresAccountRepository", () => {
  it("uses a row lock for transaction-scoped aggregate updates", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresAccountRepository({ query } as unknown as Pool);

    await expect(repository.findByIdForUpdate(asAccountId("account-1"))).resolves.toBeNull();

    expect(query).toHaveBeenCalledWith("SELECT * FROM accounts WHERE id = $1 FOR UPDATE", ["account-1"]);
  });
});
