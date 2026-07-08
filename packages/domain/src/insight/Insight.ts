import { ConfidenceScore } from "../shared/ConfidenceScore.js";
import { InvariantViolationError } from "../shared/errors.js";
import { EvidenceReference } from "../shared/EvidenceReference.js";
import type { InsightId } from "../shared/identifiers.js";
import { RelatedEntityReference } from "../shared/RelatedEntityReference.js";
import { InsightOrigin } from "./InsightOrigin.js";
import { RecommendedAction } from "./RecommendedAction.js";

/**
 * A structured, explainable piece of intelligence — the opposite of a
 * freeform AI blob. An Insight always names why it matters, what it
 * relates to, and what evidence backs it; it can never be constructed
 * without at least one related entity and at least one piece of evidence.
 */
export class Insight {
  private constructor(
    readonly id: InsightId,
    readonly summary: string,
    readonly whyItMatters: string,
    readonly relatedEntities: readonly RelatedEntityReference[],
    readonly evidence: readonly EvidenceReference[],
    readonly confidence: ConfidenceScore,
    readonly origin: InsightOrigin,
    readonly generatedAt: Date,
    readonly recommendedAction?: RecommendedAction,
  ) {}

  static of(params: {
    id: InsightId;
    summary: string;
    whyItMatters: string;
    relatedEntities: readonly RelatedEntityReference[];
    evidence: readonly EvidenceReference[];
    confidence: ConfidenceScore;
    origin: InsightOrigin;
    generatedAt: Date;
    recommendedAction?: RecommendedAction;
  }): Insight {
    if (!params.summary.trim()) {
      throw new InvariantViolationError("Insight", "summary must not be empty");
    }
    if (!params.whyItMatters.trim()) {
      throw new InvariantViolationError("Insight", "whyItMatters must not be empty");
    }
    if (params.relatedEntities.length === 0) {
      throw new InvariantViolationError("Insight", "must reference at least one related entity");
    }
    if (params.evidence.length === 0) {
      throw new InvariantViolationError("Insight", "must be backed by at least one piece of evidence");
    }
    return new Insight(
      params.id,
      params.summary.trim(),
      params.whyItMatters.trim(),
      params.relatedEntities,
      params.evidence,
      params.confidence,
      params.origin,
      params.generatedAt,
      params.recommendedAction,
    );
  }
}
