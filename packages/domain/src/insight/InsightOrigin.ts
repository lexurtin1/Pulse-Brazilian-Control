import { InvariantViolationError } from "../shared/errors.js";
import type { ContextBundleId } from "../shared/identifiers.js";
import { PromptProfile } from "../context/PromptProfile.js";

/** Who or what produced an Insight. */
export enum InsightOriginKind {
  ClaudeGenerated = "ClaudeGenerated",
  HumanAuthored = "HumanAuthored",
  HumanReviewedClaudeGenerated = "HumanReviewedClaudeGenerated",
}

/**
 * The traceable origin of an Insight. Any Claude involvement
 * (`ClaudeGenerated` or `HumanReviewedClaudeGenerated`) must carry the
 * PromptProfile and ContextBundle that produced it — this is what makes an
 * AI-derived insight auditable rather than an opaque assertion.
 */
export class InsightOrigin {
  private constructor(
    readonly kind: InsightOriginKind,
    readonly promptProfile?: PromptProfile,
    readonly contextBundleId?: ContextBundleId,
  ) {}

  static humanAuthored(): InsightOrigin {
    return new InsightOrigin(InsightOriginKind.HumanAuthored);
  }

  static claudeGenerated(params: { promptProfile: PromptProfile; contextBundleId: ContextBundleId }): InsightOrigin {
    return new InsightOrigin(InsightOriginKind.ClaudeGenerated, params.promptProfile, params.contextBundleId);
  }

  static humanReviewedClaudeGenerated(params: {
    promptProfile: PromptProfile;
    contextBundleId: ContextBundleId;
  }): InsightOrigin {
    return new InsightOrigin(
      InsightOriginKind.HumanReviewedClaudeGenerated,
      params.promptProfile,
      params.contextBundleId,
    );
  }

  static of(params: {
    kind: InsightOriginKind;
    promptProfile?: PromptProfile;
    contextBundleId?: ContextBundleId;
  }): InsightOrigin {
    const requiresTraceability =
      params.kind === InsightOriginKind.ClaudeGenerated || params.kind === InsightOriginKind.HumanReviewedClaudeGenerated;
    if (requiresTraceability && (!params.promptProfile || !params.contextBundleId)) {
      throw new InvariantViolationError(
        "InsightOrigin",
        "ClaudeGenerated and HumanReviewedClaudeGenerated origins require both promptProfile and contextBundleId",
      );
    }
    return new InsightOrigin(params.kind, params.promptProfile, params.contextBundleId);
  }
}
