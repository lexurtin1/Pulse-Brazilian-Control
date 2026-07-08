import type { INoteRepository } from "@pulse-brazil/application";
import { type AccountId, asAccountId, asNoteId, Note, type NoteId, NoteType } from "@pulse-brazil/domain";
import type { Pool } from "pg";

interface NoteRow {
  id: string;
  account_id: string;
  note_type: string;
  content: string;
  authored_by: string;
  authored_at: Date;
}

function rowToNote(row: NoteRow): Note {
  try {
    return Note.of({
      id: asNoteId(row.id),
      accountId: asAccountId(row.account_id),
      noteType: row.note_type as NoteType,
      content: row.content,
      authoredBy: row.authored_by,
      authoredAt: row.authored_at,
    });
  } catch (error) {
    throw new Error(`Failed to reconstruct Note ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Satisfies INoteRepository. No ORM — plain parameterised SQL against the notes table (see migrations/004_create_notes.sql). */
export class PostgresNoteRepository implements INoteRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: NoteId): Promise<Note | null> {
    const { rows } = await this.pool.query<NoteRow>("SELECT * FROM notes WHERE id = $1", [id]);
    const [row] = rows;
    return row ? rowToNote(row) : null;
  }

  async findByAccountId(accountId: AccountId): Promise<Note[]> {
    const { rows } = await this.pool.query<NoteRow>(
      "SELECT * FROM notes WHERE account_id = $1 ORDER BY authored_at DESC",
      [accountId],
    );
    return rows.map(rowToNote);
  }

  async save(note: Note): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO notes (id, account_id, note_type, content, authored_by, authored_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        note_type = EXCLUDED.note_type,
        content = EXCLUDED.content,
        authored_by = EXCLUDED.authored_by,
        authored_at = EXCLUDED.authored_at
      `,
      [note.id, note.accountId, note.noteType, note.content, note.authoredBy, note.authoredAt],
    );
  }
}
