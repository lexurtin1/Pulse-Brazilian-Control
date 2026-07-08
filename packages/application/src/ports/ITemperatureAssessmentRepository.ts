import type { AccountId, TemperatureAssessment } from "@pulse-brazil/domain";

/**
 * Persistence contract for TemperatureAssessment history. Assessments are
 * immutable and append-only — there is no update/delete, only `save` for a
 * new read and lookups over an account's history.
 */
export interface ITemperatureAssessmentRepository {
  findLatestForAccount(accountId: AccountId): Promise<TemperatureAssessment | null>;
  findHistoryForAccount(accountId: AccountId): Promise<TemperatureAssessment[]>;
  save(assessment: TemperatureAssessment): Promise<void>;
}
