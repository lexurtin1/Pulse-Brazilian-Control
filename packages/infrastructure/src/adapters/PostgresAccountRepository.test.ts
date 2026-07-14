import type { Pool } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";
import { Account, AccountStatus, AccountType, asAccountId, GeographicScope } from "@pulse-brazil/domain";
import { PostgresAccountRepository } from "./PostgresAccountRepository.js";

describe("PostgresAccountRepository", () => {
  it("protects relationship targets from concurrent deletion", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresAccountRepository({ query } as unknown as Pool);

    await expect(repository.findByIdForLink(asAccountId("account-1"))).resolves.toBeNull();

    expect(query).toHaveBeenCalledWith("SELECT * FROM accounts WHERE id = $1 FOR KEY SHARE", ["account-1"]);
  });

  it("does not persist a mirrored Signal relationship", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresAccountRepository({ query } as unknown as Pool);
    const account = Account.create({
      id: asAccountId("account-1"),
      name: "Account 1",
      accountType: AccountType.Bank,
      status: AccountStatus.Active,
      geographicScope: GeographicScope.brazil(),
    });

    await repository.save(account);

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).not.toContain("linked_signal_ids");
    expect(sql).not.toContain("latest_temperature");
    expect(sql).not.toContain("temperature_band");
    expect(values).toHaveLength(12);
  });
});
