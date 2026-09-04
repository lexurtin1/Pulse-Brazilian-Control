import type { ExpansionUpdateDraft } from "@pulse-brazil/domain";
import {
  asExpansionUpdateId,
  EXPANSION_UPDATE_FIELDS,
  ExpansionUpdate,
  ExpansionUpdateField,
  ExpansionUpdateOrigin,
} from "@pulse-brazil/domain";
import type { ExpansionUpdateDto, UpdateExpansionUpdateCommand } from "../../dto/update/ExpansionUpdateDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IExpansionUpdateRepository } from "../../ports/IExpansionUpdateRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import { toExpansionUpdateDto, toLastContact, toNextMeeting } from "./ExpansionUpdateMapper.js";

/**
 * Applies a person's edit to the current update and pins every field the
 * command names, so a later document ingest can't quietly undo it.
 *
 * `null` and "absent" are deliberately different here — see the command DTO.
 * Translating that distinction into the domain's draft shape is this use
 * case's whole job; the domain itself never sees the wire format.
 */
export class SaveExpansionUpdateEdits {
  constructor(
    private readonly updates: IExpansionUpdateRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: UpdateExpansionUpdateCommand): Promise<ExpansionUpdateDto> {
    const editedFields: ExpansionUpdateField[] = [];
    const patch: {
      headline?: string;
      lastContact?: ReturnType<typeof toLastContact>;
      nextMeeting?: ReturnType<typeof toNextMeeting>;
      awaitingInternal?: string[];
      nextActions?: string[];
    } = {};

    if (command.headline !== undefined) {
      if (!command.headline.trim()) {
        throw new ValidationError("headline must not be empty");
      }
      editedFields.push(ExpansionUpdateField.Headline);
      patch.headline = command.headline;
    }
    if (command.lastContact !== undefined) {
      editedFields.push(ExpansionUpdateField.LastContact);
      patch.lastContact = command.lastContact === null ? undefined : toLastContact(command.lastContact);
    }
    if (command.nextMeeting !== undefined) {
      editedFields.push(ExpansionUpdateField.NextMeeting);
      patch.nextMeeting = command.nextMeeting === null ? undefined : toNextMeeting(command.nextMeeting);
    }
    if (command.awaitingInternal !== undefined) {
      editedFields.push(ExpansionUpdateField.AwaitingInternal);
      patch.awaitingInternal = command.awaitingInternal;
    }
    if (command.nextActions !== undefined) {
      editedFields.push(ExpansionUpdateField.NextActions);
      patch.nextActions = command.nextActions;
    }

    const releasedFields = (command.unpinFields ?? []).map((field) => {
      if (!(EXPANSION_UPDATE_FIELDS as readonly string[]).includes(field)) {
        throw new ValidationError(`unpinFields must name only: ${EXPANSION_UPDATE_FIELDS.join(", ")}`);
      }
      return field as ExpansionUpdateField;
    });

    if (editedFields.length === 0 && releasedFields.length === 0) {
      throw new ValidationError("Request body must name at least one field to update");
    }

    const current = await this.updates.findCurrent();
    if (!current && releasedFields.length > 0 && editedFields.length === 0) {
      throw new ValidationError("There is no update to release fields on yet");
    }

    const now = new Date();
    let edited = current
      ? editedFields.length > 0
        ? current.applyManualEdit(patch as ExpansionUpdateDraft, editedFields, now)
        : current
      : this.createFirst(patch, editedFields);

    // Release last: a request that edits one field and frees another must
    // not have the edit's own pin stripped by ordering luck, and a field
    // named in both is a contradiction the release wins.
    if (releasedFields.length > 0) {
      edited = edited.releasePins(releasedFields, now);
    }

    await this.updates.save(edited);
    return toExpansionUpdateDto(edited);
  }

  /**
   * Writing the card by hand before anything has been ingested is a normal
   * first move, not an error — this used to 404, which read as "editing
   * doesn't save". The update is HumanDerived and cites no source document,
   * which ExpansionUpdate.of allows precisely because the citation rule
   * exists to stop Claude making unattributable claims, not to stop a
   * person recording what they know.
   */
  private createFirst(
    patch: ExpansionUpdateDraft,
    editedFields: readonly ExpansionUpdateField[],
  ): ExpansionUpdate {
    if (!patch.headline) {
      throw new ValidationError("headline is required when there is no update to edit yet");
    }
    return ExpansionUpdate.of({
      id: asExpansionUpdateId(this.idGenerator.newId()),
      asOf: new Date(),
      headline: patch.headline,
      lastContact: patch.lastContact,
      nextMeeting: patch.nextMeeting,
      awaitingInternal: patch.awaitingInternal ?? [],
      nextActions: patch.nextActions ?? [],
      sourceDocumentIds: [],
      origin: ExpansionUpdateOrigin.HumanDerived,
      manuallyEditedFields: editedFields,
    });
  }
}
