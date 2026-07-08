import { asAccountId, asNoteId, Note, NoteType } from "@pulse-brazil/domain";
import type { NoteDto } from "../../dto/note/NoteDto.js";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { INoteRepository } from "../../ports/INoteRepository.js";

export interface CreateNoteCommand {
  accountId: string;
  noteType: string;
  content: string;
  authoredBy: string;
  /** ISO date string. Defaults to now when omitted. */
  authoredAt?: string;
}

function assertNoteType(value: string): NoteType {
  if (!Object.values(NoteType).includes(value as NoteType)) {
    throw new ValidationError(`noteType must be one of: ${Object.values(NoteType).join(", ")}`);
  }
  return value as NoteType;
}

/** Records a salesperson's call/meeting note against an account, verifying the account exists first. */
export class CreateNote {
  constructor(
    private readonly notes: INoteRepository,
    private readonly accounts: IAccountRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: CreateNoteCommand): Promise<NoteDto> {
    if (!command.accountId.trim()) {
      throw new ValidationError("accountId is required");
    }
    const accountId = asAccountId(command.accountId);

    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundError("Account", command.accountId);
    }

    const note = Note.of({
      id: asNoteId(this.idGenerator.newId()),
      accountId: account.id,
      noteType: assertNoteType(command.noteType),
      content: command.content,
      authoredBy: command.authoredBy,
      authoredAt: command.authoredAt ? new Date(command.authoredAt) : new Date(),
    });

    await this.notes.save(note);

    return {
      id: note.id,
      accountId: note.accountId,
      noteType: note.noteType,
      content: note.content,
      authoredBy: note.authoredBy,
      authoredAt: note.authoredAt.toISOString(),
    };
  }
}
