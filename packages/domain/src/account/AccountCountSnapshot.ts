import { InvariantViolationError } from "../shared/errors.js";
import type { AccountCountSnapshotId, DocumentId } from "../shared/identifiers.js";

export interface AccountCountSnapshotProps {
  id: AccountCountSnapshotId;
  count: number;
  asOf: Date;
  sourceDocumentId?: DocumentId;
}

function assertValid(props: AccountCountSnapshotProps): void {
  if (props.count < 0) {
    throw new InvariantViolationError("AccountCountSnapshot", "count must not be negative");
  }
}

/**
 * A point-in-time count of tracked accounts — the "Active Accounts · BR"
 * KPI, which means the desk's total Brazil target list, not a filter on
 * AccountStatus.Active (a CRM lifecycle status meaning "currently a live
 * paying client"; most tracked accounts are legitimately Prospect/Dormant
 * and still belong on this count). Unlike Deal, the accounts table is
 * mutable current state rather than an append-only import artifact, so "the
 * count as of a given moment" can't be reconstructed retroactively — it has
 * to be captured and persisted when it's true. Written once after every
 * ImportLocationCsv run (see claude/INTEGRATION_PLAN.md Feature 2), plus
 * manual backfill/corrective rows where needed. `sourceDocumentId` is
 * absent on rows with no triggering upload.
 */
export class AccountCountSnapshot {
  private constructor(private readonly props: AccountCountSnapshotProps) {}

  static record(params: { id: AccountCountSnapshotId; count: number; asOf: Date; sourceDocumentId?: DocumentId }): AccountCountSnapshot {
    const props: AccountCountSnapshotProps = { ...params };
    assertValid(props);
    return new AccountCountSnapshot(props);
  }

  /** Repository-only rehydration from stored fields. */
  static reconstruct(props: AccountCountSnapshotProps): AccountCountSnapshot {
    assertValid(props);
    return new AccountCountSnapshot(props);
  }

  get id(): AccountCountSnapshotId {
    return this.props.id;
  }
  get count(): number {
    return this.props.count;
  }
  get asOf(): Date {
    return this.props.asOf;
  }
  get sourceDocumentId(): DocumentId | undefined {
    return this.props.sourceDocumentId;
  }
}
