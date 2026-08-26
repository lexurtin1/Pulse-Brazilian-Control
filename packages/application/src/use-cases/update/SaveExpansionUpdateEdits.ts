import type { ExpansionUpdateDraft } from "@pulse-brazil/domain";
import { ExpansionUpdateField } from "@pulse-brazil/domain";
import type { ExpansionUpdateDto, UpdateExpansionUpdateCommand } from "../../dto/update/ExpansionUpdateDto.js";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IExpansionUpdateRepository } from "../../ports/IExpansionUpdateRepository.js";
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
  constructor(private readonly updates: IExpansionUpdateRepository) {}

  async execute(command: UpdateExpansionUpdateCommand): Promise<ExpansionUpdateDto> {
    const current = await this.updates.findCurrent();
    if (!current) {
      throw new NotFoundError("ExpansionUpdate", "current");
    }

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

    if (editedFields.length === 0) {
      throw new ValidationError("Request body must name at least one field to update");
    }

    const edited = current.applyManualEdit(patch as ExpansionUpdateDraft, editedFields, new Date());
    await this.updates.save(edited);
    return toExpansionUpdateDto(edited);
  }
}
