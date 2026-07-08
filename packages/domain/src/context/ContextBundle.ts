import { EvidenceReference } from "../shared/EvidenceReference.js";
import type { AccountId, ContextBundleId } from "../shared/identifiers.js";

/**
 * A manifest of exactly what evidence was assembled for a single Claude
 * reasoning call — the domain's half of "Claude should not be given
 * uncontrolled context by default." The domain only defines this shape so
 * an Insight can point back to it; actual retrieval and assembly logic is
 * an application-layer concern, not modeled here.
 */
export class ContextBundle {
  private constructor(
    readonly id: ContextBundleId,
    readonly assembledAt: Date,
    readonly evidence: readonly EvidenceReference[],
    readonly subjectAccountId?: AccountId,
  ) {}

  static of(params: {
    id: ContextBundleId;
    assembledAt: Date;
    evidence: readonly EvidenceReference[];
    subjectAccountId?: AccountId;
  }): ContextBundle {
    return new ContextBundle(params.id, params.assembledAt, params.evidence, params.subjectAccountId);
  }
}
