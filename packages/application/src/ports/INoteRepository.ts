import type { AccountId, Note, NoteId } from "@pulse-brazil/domain";

export interface INoteRepository {
  findById(id: NoteId): Promise<Note | null>;
  findByAccountId(accountId: AccountId): Promise<Note[]>;
  save(note: Note): Promise<void>;
}
