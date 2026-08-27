import type { AccountId, TemperatureAssessment } from "@pulse-brazil/domain";

/**
 * Persistence contract for TemperatureAssessment history. Assessments are
 * immutable and append-only — there is no update/delete, only `save` for a
 * new read and lookups over an account's history.
 */
export interface ITemperatureAssessmentRepository {
  findLatestForAccount(accountId: AccountId): Promise<TemperatureAssessment | null>;
  /** One deterministic latest-assessment projection for each requested Account, avoiding N+1 reads. */
  findLatestForAccounts(accountIds: readonly AccountId[]): Promise<Map<AccountId, TemperatureAssessment>>;
  findHistoryForAccount(accountId: AccountId): Promise<TemperatureAssessment[]>;
  save(assessment: TemperatureAssessment): Promise<void>;
}
