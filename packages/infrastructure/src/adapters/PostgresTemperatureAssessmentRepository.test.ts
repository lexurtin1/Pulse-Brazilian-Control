import type { Pool } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";
import { asAccountId } from "@pulse-brazil/domain";
import { PostgresTemperatureAssessmentRepository } from "./PostgresTemperatureAssessmentRepository.js";

describe("PostgresTemperatureAssessmentRepository", () => {
  it("uses one deterministic bulk query for current assessments", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresTemperatureAssessmentRepository({ query } as unknown as Pool);

    const result = await repository.findLatestForAccounts([asAccountId("account-1"), asAccountId("account-2")]);

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("DISTINCT ON (account_id)");
    expect(sql).toContain("assessed_at DESC, created_at DESC, id DESC");
    expect(values).toEqual([["account-1", "account-2"]]);
    expect(result.size).toBe(0);
  });

  it("does not query for an empty Account set", async () => {
    const query = vi.fn();
    const repository = new PostgresTemperatureAssessmentRepository({ query } as unknown as Pool);

    await expect(repository.findLatestForAccounts([])).resolves.toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });
});
