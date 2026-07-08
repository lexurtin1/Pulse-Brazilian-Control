import { InvariantViolationError } from "../shared/errors.js";
import type { AccountId, NoteId } from "../shared/identifiers.js";
import { NoteType } from "./NoteType.js";

/**
 * A salesperson's own account-scoped record — a call note, meeting note,
 * or follow-up — captured before any AI interpretation. This is raw human
 * business content, not a prompt: it becomes evidence once referenced by an
 * EvidenceReference, but it stands on its own as a durable record either way.
 */
export class Note {
  private constructor(
    readonly id: NoteId,
    readonly accountId: AccountId,
    readonly noteType: NoteType,
    readonly content: string,
    readonly authoredBy: string,
    readonly authoredAt: Date,
  ) {}

  static of(params: {
    id: NoteId;
    accountId: AccountId;
    noteType: NoteType;
    content: string;
    authoredBy: string;
    authoredAt: Date;
  }): Note {
    if (!params.content.trim()) {
      throw new InvariantViolationError("Note", "content must not be empty");
    }
    if (!params.authoredBy.trim()) {
      throw new InvariantViolationError("Note", "authoredBy must not be empty");
    }
    return new Note(
      params.id,
      params.accountId,
      params.noteType,
      params.content.trim(),
      params.authoredBy.trim(),
      params.authoredAt,
    );
  }
}
