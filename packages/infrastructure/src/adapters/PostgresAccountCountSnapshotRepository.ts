import type { IAccountCountSnapshotRepository } from "@pulse-brazil/application";
import { AccountCountSnapshot, asAccountCountSnapshotId, asDocumentId, type AccountCountSnapshotProps } from "@pulse-brazil/domain";
import type { Pool } from "pg";

interface AccountCountSnapshotRow {
  id: string;
  count: number;
  as_of: string | Date;
  source_document_id: string | null;
}

function rowToSnapshot(row: AccountCountSnapshotRow): AccountCountSnapshot {
  const props: AccountCountSnapshotProps = {
    id: asAccountCountSnapshotId(row.id),
    count: row.count,
    asOf: new Date(row.as_of),
    sourceDocumentId: row.source_document_id ? asDocumentId(row.source_document_id) : undefined,
  };
  return AccountCountSnapshot.reconstruct(props);
}

/** Satisfies IAccountCountSnapshotRepository. No ORM — plain parameterised SQL (see migrations/014_create_account_count_snapshots.sql). */
export class PostgresAccountCountSnapshotRepository implements IAccountCountSnapshotRepository {
  constructor(private readonly pool: Pool) {}

  async findRecent(limit: number): Promise<AccountCountSnapshot[]> {
    const { rows } = await this.pool.query<AccountCountSnapshotRow>(
      "SELECT * FROM account_count_snapshots ORDER BY as_of DESC LIMIT $1",
      [limit],
    );
    return rows.map(rowToSnapshot);
  }

  async save(snapshot: AccountCountSnapshot): Promise<void> {
    await this.pool.query(
      "INSERT INTO account_count_snapshots (id, count, as_of, source_document_id) VALUES ($1, $2, $3, $4)",
      [snapshot.id, snapshot.count, snapshot.asOf, snapshot.sourceDocumentId ?? null],
    );
  }
}
