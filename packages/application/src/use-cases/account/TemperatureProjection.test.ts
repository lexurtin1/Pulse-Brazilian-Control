import { describe, expect, it, vi } from "vitest";
import {
  Account,
  AccountStatus,
  AccountType,
  asAccountId,
  asTemperatureAssessmentId,
  ConfidenceScore,
  GeographicScope,
  TemperatureAssessment,
  TemperatureBand,
} from "@pulse-brazil/domain";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { ITemperatureAssessmentRepository } from "../../ports/ITemperatureAssessmentRepository.js";
import { ListAccounts } from "./ListAccounts.js";
import { UpdateAccountTemperature } from "./UpdateAccountTemperature.js";

function account(): Account {
  return Account.create({
    id: asAccountId("account-1"),
    name: "Account 1",
    accountType: AccountType.Bank,
    status: AccountStatus.Active,
    geographicScope: GeographicScope.brazil(),
  });
}

function assessment(): TemperatureAssessment {
  return TemperatureAssessment.of({
    id: asTemperatureAssessmentId("temperature-1"),
    accountId: asAccountId("account-1"),
    band: TemperatureBand.Hot,
    rationale: "Strong engagement",
    evidence: [],
    assessedAt: new Date("2026-01-01T00:00:00.000Z"),
    assessedBy: "tester",
    confidence: ConfidenceScore.of(1),
  });
}

function accountRepository(save = vi.fn()): IAccountRepository {
  return {
    findById: async () => account(),
    findAll: async () => [account()],
    findAllWithCoordinates: async () => [],
    save,
    delete: async () => undefined,
  };
}

function temperatureRepository(save = vi.fn()): ITemperatureAssessmentRepository {
  const latest = assessment();
  return {
    findLatestForAccount: async () => latest,
    findLatestForAccounts: async () => new Map([[latest.accountId, latest]]),
    findHistoryForAccount: async () => [latest],
    save,
  };
}

describe("canonical temperature projections", () => {
  it("bulk-projects current temperature when listing Accounts", async () => {
    const result = await new ListAccounts(accountRepository(), temperatureRepository()).execute();

    expect(result[0]?.temperatureBand).toBe(TemperatureBand.Hot);
    expect(result[0]?.latestAssessmentDate).toBe("2026-01-01T00:00:00.000Z");
  });

  it("records only immutable history when temperature changes", async () => {
    const saveAccount = vi.fn();
    const saveAssessment = vi.fn();
    const useCase = new UpdateAccountTemperature(
      accountRepository(saveAccount),
      temperatureRepository(saveAssessment),
      { newId: () => "temperature-2" },
    );

    await useCase.execute({
      accountId: "account-1",
      band: TemperatureBand.Warm,
      rationale: "Recent activity",
      assessedBy: "tester",
      assessedAt: "2026-02-01T00:00:00.000Z",
      confidenceScore: 0.8,
    });

    expect(saveAssessment).toHaveBeenCalledOnce();
    expect(saveAccount).not.toHaveBeenCalled();
  });
});
