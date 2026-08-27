import type { Pool } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";
import {
  asAccountId,
  asSignalId,
  ConfidenceScore,
  ConnectorSource,
  Signal,
  SignalOrigin,
  SignalType,
} from "@pulse-brazil/domain";
import { PostgresSignalRepository } from "./PostgresSignalRepository.js";

function signal(): Signal {
  return Signal.of({
    id: asSignalId("signal-1"),
    source: ConnectorSource.ManualEntry,
    type: SignalType.AccountSpecific,
    title: "New mandate",
    summary: "Relevant account activity",
    linkedAccountIds: [asAccountId("account-1")],
    linkedThemeIds: [],
    dateObserved: new Date("2026-07-14T12:00:00.000Z"),
    evidence: [],
    confidence: ConfidenceScore.of(1),
    origin: SignalOrigin.HumanDerived,
  });
}

describe("PostgresSignalRepository", () => {
  it("reads account links from the canonical relationship table", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresSignalRepository({ query } as unknown as Pool);

    await repository.findByAccountId(asAccountId("account-1"));

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("FROM account_signals AS relation");
    expect(sql).not.toContain("linked_account_ids @>");
    expect(values).toEqual(["account-1"]);
  });

  it("persists the Signal and its canonical links in one statement", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresSignalRepository({ query } as unknown as Pool);

    await repository.save(signal());

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("DELETE FROM account_signals");
    expect(sql).toContain("INSERT INTO account_signals");
    expect(sql).not.toContain("linked_account_ids,");
    expect(values?.at(-1)).toEqual(["account-1"]);
  });
});
