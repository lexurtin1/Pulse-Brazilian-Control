import { InvariantViolationError } from "../shared/errors.js";
import type { AccountId, DocumentId, InsightId, SignalId, ThemeId } from "../shared/identifiers.js";
import { DocumentType } from "./DocumentType.js";
import { canTransitionIngestionState, IngestionState } from "./IngestionState.js";
import { Provenance } from "./Provenance.js";

interface SourceDocumentProps {
  id: DocumentId;
  declaredType: DocumentType;
  inferredType?: DocumentType;
  linkedAccountId?: AccountId;
  linkedThemeIds: readonly ThemeId[];
  ingestionState: IngestionState;
  extractedReferences: readonly (InsightId | SignalId)[];
  provenance: Provenance;
}

/**
 * A manually uploaded (or connector-delivered) source document moving
 * through classification and linkage. `declaredType` is what the uploader
 * said it was; `inferredType` is what Claude later concluded — kept as two
 * separate fields, never merged, so a mismatch is a visible signal rather
 * than a silent override (per the ask-first policy on AI vs user intent).
 */
export class SourceDocument {
  private constructor(private readonly props: SourceDocumentProps) {}

  static receive(params: {
    id: DocumentId;
    declaredType: DocumentType;
    linkedAccountId?: AccountId;
    linkedThemeIds?: readonly ThemeId[];
    provenance: Provenance;
  }): SourceDocument {
    return new SourceDocument({
      id: params.id,
      declaredType: params.declaredType,
      linkedAccountId: params.linkedAccountId,
      linkedThemeIds: params.linkedThemeIds ?? [],
      ingestionState: IngestionState.Received,
      extractedReferences: [],
      provenance: params.provenance,
    });
  }

  get id(): DocumentId {
    return this.props.id;
  }
  get declaredType(): DocumentType {
    return this.props.declaredType;
  }
  get inferredType(): DocumentType | undefined {
    return this.props.inferredType;
  }
  get linkedAccountId(): AccountId | undefined {
    return this.props.linkedAccountId;
  }
  get linkedThemeIds(): readonly ThemeId[] {
    return this.props.linkedThemeIds;
  }
  get ingestionState(): IngestionState {
    return this.props.ingestionState;
  }
  get extractedReferences(): readonly (InsightId | SignalId)[] {
    return this.props.extractedReferences;
  }
  get provenance(): Provenance {
    return this.props.provenance;
  }

  /** True when Claude's inferred type disagrees with what the uploader declared — surface, never silently resolve. */
  get hasClassificationConflict(): boolean {
    return this.props.inferredType !== undefined && this.props.inferredType !== this.props.declaredType;
  }

  withInferredType(inferredType: DocumentType): SourceDocument {
    return new SourceDocument({ ...this.props, inferredType });
  }

  withLinkedAccount(linkedAccountId: AccountId): SourceDocument {
    return new SourceDocument({ ...this.props, linkedAccountId });
  }

  withLinkedThemes(linkedThemeIds: readonly ThemeId[]): SourceDocument {
    return new SourceDocument({ ...this.props, linkedThemeIds });
  }

  withExtractedReference(reference: InsightId | SignalId): SourceDocument {
    if (this.props.extractedReferences.includes(reference)) return this;
    return new SourceDocument({
      ...this.props,
      extractedReferences: [...this.props.extractedReferences, reference],
    });
  }

  transitionTo(nextState: IngestionState): SourceDocument {
    if (!canTransitionIngestionState(this.props.ingestionState, nextState)) {
      throw new InvariantViolationError(
        "SourceDocument",
        `cannot transition ingestionState from ${this.props.ingestionState} to ${nextState}`,
      );
    }
    return new SourceDocument({ ...this.props, ingestionState: nextState });
  }
}
