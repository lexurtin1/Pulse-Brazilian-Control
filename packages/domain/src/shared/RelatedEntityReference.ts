import type { AccountId, DocumentId, NoteId, SignalId, ThemeId } from "./identifiers.js";

/** The kinds of domain object an Insight (or other artifact) can point at. */
export enum RelatedEntityKind {
  Account = "Account",
  Theme = "Theme",
  Signal = "Signal",
  SourceDocument = "SourceDocument",
  Note = "Note",
}

export type RelatedEntityId = AccountId | ThemeId | SignalId | DocumentId | NoteId;

/**
 * A typed pointer from one artifact to another domain object, without
 * embedding that object. Keeps aggregates independent while still letting
 * an Insight say precisely what it is about.
 */
export class RelatedEntityReference {
  private constructor(
    readonly kind: RelatedEntityKind,
    readonly id: RelatedEntityId,
  ) {}

  static of(kind: RelatedEntityKind, id: RelatedEntityId): RelatedEntityReference {
    return new RelatedEntityReference(kind, id);
  }
}
