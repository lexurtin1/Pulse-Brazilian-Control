import { InvariantViolationError } from "./errors.js";
import type { DocumentId, NoteId, SignalId } from "./identifiers.js";

/**
 * What kind of record backs a piece of evidence. "ManualAssertion" covers a
 * human simply stating something is true without pointing at a stored
 * artifact — allowed, but distinguishable from artifact-backed evidence.
 */
export enum EvidenceKind {
  Note = "Note",
  SourceDocument = "SourceDocument",
  Signal = "Signal",
  ExternalReference = "ExternalReference",
  ManualAssertion = "ManualAssertion",
}

export type EvidenceReferenceId = NoteId | DocumentId | SignalId;

/**
 * A pointer to whatever grounds a claim — never the claim's content itself.
 * This is what makes temperature assessments, signals, and insights
 * evidence-backed rather than opaque: every confident statement in Pulse
 * Brazil can be traced back to a note, a document, a signal, or an explicit
 * manual assertion. `referenceId` is only absent for `ManualAssertion`,
 * which by definition doesn't point at a stored artifact.
 */
export class EvidenceReference {
  private constructor(
    readonly kind: EvidenceKind,
    readonly referenceId?: EvidenceReferenceId,
    readonly excerpt?: string,
    readonly locator?: string,
  ) {}

  static of(params: {
    kind: EvidenceKind;
    referenceId?: EvidenceReferenceId;
    excerpt?: string;
    locator?: string;
  }): EvidenceReference {
    if (params.kind !== EvidenceKind.ManualAssertion && !params.referenceId) {
      throw new InvariantViolationError(
        "EvidenceReference",
        "referenceId is required unless kind is ManualAssertion",
      );
    }
    return new EvidenceReference(params.kind, params.referenceId, params.excerpt, params.locator);
  }
}
