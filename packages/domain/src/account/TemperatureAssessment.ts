import { ConfidenceScore } from "../shared/ConfidenceScore.js";
import { InvariantViolationError } from "../shared/errors.js";
import { EvidenceReference } from "../shared/EvidenceReference.js";
import type { AccountId, TemperatureAssessmentId } from "../shared/identifiers.js";
import { TemperatureBand } from "./TemperatureBand.js";

/**
 * A single point-in-time read on an account's commercial temperature.
 * Modeled as its own entity (not just a field on Account) so the history of
 * how and why an account's temperature changed is never lost — each
 * assessment is immutable once created; a new read produces a new
 * TemperatureAssessment rather than mutating the last one.
 */
export class TemperatureAssessment {
  private constructor(
    readonly id: TemperatureAssessmentId,
    readonly accountId: AccountId,
    readonly band: TemperatureBand,
    readonly rationale: string,
    readonly evidence: readonly EvidenceReference[],
    readonly assessedAt: Date,
    readonly assessedBy: string,
    readonly confidence: ConfidenceScore,
    readonly nextAction?: string,
  ) {}

  static of(params: {
    id: TemperatureAssessmentId;
    accountId: AccountId;
    band: TemperatureBand;
    rationale: string;
    evidence: readonly EvidenceReference[];
    assessedAt: Date;
    assessedBy: string;
    confidence: ConfidenceScore;
    nextAction?: string;
  }): TemperatureAssessment {
    if (!params.rationale.trim()) {
      throw new InvariantViolationError("TemperatureAssessment", "rationale must not be empty");
    }
    if (!params.assessedBy.trim()) {
      throw new InvariantViolationError("TemperatureAssessment", "assessedBy must not be empty");
    }
    if (params.assessedAt.getTime() > Date.now()) {
      throw new InvariantViolationError("TemperatureAssessment", "assessedAt must not be in the future");
    }
    return new TemperatureAssessment(
      params.id,
      params.accountId,
      params.band,
      params.rationale.trim(),
      params.evidence,
      params.assessedAt,
      params.assessedBy.trim(),
      params.confidence,
      params.nextAction?.trim() || undefined,
    );
  }
}
