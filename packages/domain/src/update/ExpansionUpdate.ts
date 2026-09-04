import { InvariantViolationError } from "../shared/errors.js";
import type { AccountId, DocumentId, ExpansionUpdateId } from "../shared/identifiers.js";
import { ExpansionUpdateField } from "./ExpansionUpdateField.js";

/** Who last touched a given field's content — a person editing the card, or Claude reading a document. */
export enum ExpansionUpdateOrigin {
  HumanDerived = "HumanDerived",
  MachineDerived = "MachineDerived",
}

/** The most recent substantive contact with a counterparty. `accountId` is set only when the contact maps to a known Account. */
export interface LastContact {
  readonly occurredAt: Date;
  readonly accountId?: AccountId;
  readonly contactNames: readonly string[];
  readonly discussed: string;
}

export interface NextMeeting {
  readonly scheduledFor: Date;
  readonly withWhom: string;
  readonly purpose: string;
}

export interface ExpansionUpdateProps {
  readonly id: ExpansionUpdateId;
  readonly asOf: Date;
  readonly headline: string;
  readonly lastContact?: LastContact;
  readonly nextMeeting?: NextMeeting;
  readonly awaitingInternal: readonly string[];
  readonly nextActions: readonly string[];
  readonly sourceDocumentIds: readonly DocumentId[];
  readonly origin: ExpansionUpdateOrigin;
  readonly manuallyEditedFields: readonly ExpansionUpdateField[];
}

/** The subset of an update Claude can propose. Everything else — provenance, edit history — is decided here, never by the model. */
export interface ExpansionUpdateDraft {
  readonly headline?: string;
  readonly lastContact?: LastContact;
  readonly nextMeeting?: NextMeeting;
  readonly awaitingInternal?: readonly string[];
  readonly nextActions?: readonly string[];
}

/**
 * The single running answer to "where are we with Brazil right now" — last
 * contact, next meeting, what we're blocked on internally, what's next.
 *
 * There is exactly one current update; a document ingest revises it rather
 * than appending to a log (the Live Feed is already the log). The entity is
 * immutable: both revision paths return a new instance.
 *
 * `manuallyEditedFields` is the load-bearing rule. A field a person has
 * edited is pinned — `applyDraft` will not overwrite it, however confident
 * Claude is about the document it just read. Without that, one stray call
 * note would silently undo a correction, and the card would stop being
 * trustworthy the first time it happened.
 */
export class ExpansionUpdate {
  private constructor(private readonly props: ExpansionUpdateProps) {}

  static of(params: ExpansionUpdateProps): ExpansionUpdate {
    if (!params.headline.trim()) {
      throw new InvariantViolationError("ExpansionUpdate", "headline must not be empty");
    }
    if (params.lastContact && !params.lastContact.discussed.trim()) {
      throw new InvariantViolationError("ExpansionUpdate", "lastContact.discussed must not be empty when lastContact is present");
    }
    if (params.nextMeeting && !params.nextMeeting.withWhom.trim()) {
      throw new InvariantViolationError("ExpansionUpdate", "nextMeeting.withWhom must not be empty when nextMeeting is present");
    }
    // A machine-derived update with no source document is an unattributable
    // claim — the whole point of this card is that every statement on it can
    // be traced back to something that was actually uploaded.
    if (params.origin === ExpansionUpdateOrigin.MachineDerived && params.sourceDocumentIds.length === 0) {
      throw new InvariantViolationError("ExpansionUpdate", "a MachineDerived update must cite at least one source document");
    }
    return new ExpansionUpdate({
      ...params,
      headline: params.headline.trim(),
      awaitingInternal: params.awaitingInternal.filter((entry) => entry.trim()).map((entry) => entry.trim()),
      nextActions: params.nextActions.filter((entry) => entry.trim()).map((entry) => entry.trim()),
      manuallyEditedFields: [...new Set(params.manuallyEditedFields)],
    });
  }

  get id(): ExpansionUpdateId {
    return this.props.id;
  }
  get asOf(): Date {
    return this.props.asOf;
  }
  get headline(): string {
    return this.props.headline;
  }
  get lastContact(): LastContact | undefined {
    return this.props.lastContact;
  }
  get nextMeeting(): NextMeeting | undefined {
    return this.props.nextMeeting;
  }
  get awaitingInternal(): readonly string[] {
    return this.props.awaitingInternal;
  }
  get nextActions(): readonly string[] {
    return this.props.nextActions;
  }
  get sourceDocumentIds(): readonly DocumentId[] {
    return this.props.sourceDocumentIds;
  }
  get origin(): ExpansionUpdateOrigin {
    return this.props.origin;
  }
  get manuallyEditedFields(): readonly ExpansionUpdateField[] {
    return this.props.manuallyEditedFields;
  }

  isPinned(field: ExpansionUpdateField): boolean {
    return this.props.manuallyEditedFields.includes(field);
  }

  /**
   * Merges a Claude-extracted draft over this update, skipping every pinned
   * field and every field the draft leaves undefined. The result cites the
   * new source document in addition to the ones already cited, so the
   * provenance trail accumulates rather than being replaced.
   */
  applyDraft(draft: ExpansionUpdateDraft, sourceDocumentId: DocumentId, asOf: Date): ExpansionUpdate {
    const take = <Value>(field: ExpansionUpdateField, proposed: Value | undefined, current: Value): Value =>
      this.isPinned(field) || proposed === undefined ? current : proposed;

    return ExpansionUpdate.of({
      ...this.props,
      asOf,
      headline: take(ExpansionUpdateField.Headline, draft.headline?.trim() || undefined, this.props.headline),
      lastContact: take(ExpansionUpdateField.LastContact, draft.lastContact, this.props.lastContact),
      nextMeeting: take(ExpansionUpdateField.NextMeeting, draft.nextMeeting, this.props.nextMeeting),
      awaitingInternal: take(ExpansionUpdateField.AwaitingInternal, draft.awaitingInternal, this.props.awaitingInternal),
      nextActions: take(ExpansionUpdateField.NextActions, draft.nextActions, this.props.nextActions),
      sourceDocumentIds: [...new Set([...this.props.sourceDocumentIds, sourceDocumentId])],
    });
  }

  /**
   * Which of a draft's proposals this update's pins would throw away.
   *
   * Pinning is silent by design — `applyDraft` simply keeps the current
   * value. That silence is what let this card sit frozen while every upload
   * reported success, so the ingest pipeline asks this first and says out
   * loud what it was not allowed to write.
   */
  blockedFields(draft: ExpansionUpdateDraft): ExpansionUpdateField[] {
    const proposals: readonly (readonly [ExpansionUpdateField, unknown])[] = [
      [ExpansionUpdateField.Headline, draft.headline?.trim() || undefined],
      [ExpansionUpdateField.LastContact, draft.lastContact],
      [ExpansionUpdateField.NextMeeting, draft.nextMeeting],
      [ExpansionUpdateField.AwaitingInternal, draft.awaitingInternal],
      [ExpansionUpdateField.NextActions, draft.nextActions],
    ];
    return proposals
      .filter(([field, proposed]) => proposed !== undefined && this.isPinned(field))
      .map(([field]) => field);
  }

  /**
   * Hands a field back to the ingest pipeline.
   *
   * A pin protects a correction, but a correction goes stale like anything
   * else: the meeting it described happens, the blocker it recorded clears.
   * Without a way back, one edit means that field can never be refreshed
   * again — the card stops being an update and becomes an archive.
   */
  releasePins(fields: readonly ExpansionUpdateField[], asOf: Date): ExpansionUpdate {
    const released = new Set<string>(fields);
    return ExpansionUpdate.of({
      ...this.props,
      asOf,
      manuallyEditedFields: this.props.manuallyEditedFields.filter((field) => !released.has(field)),
    });
  }

  /**
   * Applies a person's edit. Every field the patch names becomes pinned.
   *
   * `undefined` means two different things here, so the fields can't share
   * one code path: for lastContact/nextMeeting it is itself a value ("there
   * is no next meeting") that a later regeneration must respect, while the
   * headline and the two lists have no absent state — an omitted entry
   * there just means "leave this one alone".
   */
  applyManualEdit(patch: ExpansionUpdateDraft, editedFields: readonly ExpansionUpdateField[], asOf: Date): ExpansionUpdate {
    const edited = (field: ExpansionUpdateField): boolean => editedFields.includes(field);

    return ExpansionUpdate.of({
      ...this.props,
      asOf,
      headline: (edited(ExpansionUpdateField.Headline) ? patch.headline : undefined) ?? this.props.headline,
      lastContact: edited(ExpansionUpdateField.LastContact) ? patch.lastContact : this.props.lastContact,
      nextMeeting: edited(ExpansionUpdateField.NextMeeting) ? patch.nextMeeting : this.props.nextMeeting,
      awaitingInternal:
        (edited(ExpansionUpdateField.AwaitingInternal) ? patch.awaitingInternal : undefined) ?? this.props.awaitingInternal,
      nextActions: (edited(ExpansionUpdateField.NextActions) ? patch.nextActions : undefined) ?? this.props.nextActions,
      manuallyEditedFields: [...this.props.manuallyEditedFields, ...editedFields],
    });
  }
}
