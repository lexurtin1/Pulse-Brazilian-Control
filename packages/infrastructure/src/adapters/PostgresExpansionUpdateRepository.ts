import type { IExpansionUpdateRepository } from "@pulse-brazil/application";
import {
  asAccountId,
  asDocumentId,
  asExpansionUpdateId,
  ExpansionUpdate,
  type ExpansionUpdateField,
  ExpansionUpdateOrigin,
  type LastContact,
  type NextMeeting,
} from "@pulse-brazil/domain";
import type { Pool } from "@neondatabase/serverless";

/** The JSONB shapes as they sit on disk — dates are ISO strings there, Date objects in the domain. */
interface LastContactJson {
  occurredAt: string;
  accountId?: string | null;
  contactNames: string[];
  discussed: string;
}

interface NextMeetingJson {
  scheduledFor: string;
  withWhom: string;
  purpose: string;
}

interface ExpansionUpdateRow {
  id: string;
  as_of: Date;
  headline: string;
  last_contact: LastContactJson | null;
  next_meeting: NextMeetingJson | null;
  awaiting_internal: string[];
  next_actions: string[];
  source_document_ids: string[];
  origin: string;
  manually_edited_fields: string[];
}

function toLastContact(json: LastContactJson | null): LastContact | undefined {
  if (!json) return undefined;
  return {
    occurredAt: new Date(json.occurredAt),
    accountId: json.accountId ? asAccountId(json.accountId) : undefined,
    contactNames: json.contactNames,
    discussed: json.discussed,
  };
}

function toNextMeeting(json: NextMeetingJson | null): NextMeeting | undefined {
  if (!json) return undefined;
  return { scheduledFor: new Date(json.scheduledFor), withWhom: json.withWhom, purpose: json.purpose };
}

function rowToExpansionUpdate(row: ExpansionUpdateRow): ExpansionUpdate {
  try {
    return ExpansionUpdate.of({
      id: asExpansionUpdateId(row.id),
      asOf: row.as_of,
      headline: row.headline,
      lastContact: toLastContact(row.last_contact),
      nextMeeting: toNextMeeting(row.next_meeting),
      awaitingInternal: row.awaiting_internal,
      nextActions: row.next_actions,
      sourceDocumentIds: row.source_document_ids.map(asDocumentId),
      origin: row.origin as ExpansionUpdateOrigin,
      manuallyEditedFields: row.manually_edited_fields as ExpansionUpdateField[],
    });
  } catch (error) {
    throw new Error(
      `Failed to reconstruct ExpansionUpdate ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Satisfies IExpansionUpdateRepository. Plain parameterised SQL — see migrations/021_create_expansion_updates.sql. */
export class PostgresExpansionUpdateRepository implements IExpansionUpdateRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * ORDER BY as_of DESC rather than assuming a single row: nothing at the
   * database level enforces "only one", and reading the newest is correct
   * whether or not an older one is ever left behind.
   */
  async findCurrent(): Promise<ExpansionUpdate | null> {
    const { rows } = await this.pool.query<ExpansionUpdateRow>(
      "SELECT * FROM expansion_updates ORDER BY as_of DESC, created_at DESC LIMIT 1",
    );
    const [row] = rows;
    return row ? rowToExpansionUpdate(row) : null;
  }

  async save(update: ExpansionUpdate): Promise<void> {
    const lastContact: LastContactJson | null = update.lastContact
      ? {
          occurredAt: update.lastContact.occurredAt.toISOString(),
          accountId: update.lastContact.accountId ?? null,
          contactNames: [...update.lastContact.contactNames],
          discussed: update.lastContact.discussed,
        }
      : null;
    const nextMeeting: NextMeetingJson | null = update.nextMeeting
      ? {
          scheduledFor: update.nextMeeting.scheduledFor.toISOString(),
          withWhom: update.nextMeeting.withWhom,
          purpose: update.nextMeeting.purpose,
        }
      : null;

    await this.pool.query(
      `
      INSERT INTO expansion_updates (
        id, as_of, headline, last_contact, next_meeting,
        awaiting_internal, next_actions, source_document_ids, origin, manually_edited_fields
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        as_of = EXCLUDED.as_of,
        headline = EXCLUDED.headline,
        last_contact = EXCLUDED.last_contact,
        next_meeting = EXCLUDED.next_meeting,
        awaiting_internal = EXCLUDED.awaiting_internal,
        next_actions = EXCLUDED.next_actions,
        source_document_ids = EXCLUDED.source_document_ids,
        origin = EXCLUDED.origin,
        manually_edited_fields = EXCLUDED.manually_edited_fields,
        updated_at = now()
      `,
      [
        update.id,
        update.asOf,
        update.headline,
        lastContact === null ? null : JSON.stringify(lastContact),
        nextMeeting === null ? null : JSON.stringify(nextMeeting),
        JSON.stringify(update.awaitingInternal),
        JSON.stringify(update.nextActions),
        JSON.stringify(update.sourceDocumentIds),
        update.origin,
        JSON.stringify(update.manuallyEditedFields),
      ],
    );
  }
}
