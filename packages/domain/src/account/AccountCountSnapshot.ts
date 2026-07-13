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
 * A point-in-time count of Active accounts. Unlike Deal, Account.status is
 * mutable current state rather than an append-only import artifact, so "the
 * count as of a given moment" can't be reconstructed retroactively from the
 * accounts table — it has to be captured and persisted when it's true.
 * Written once after every ImportLocationCsv run (see
 * claude/INTEGRATION_PLAN.md Feature 2), plus one manual backfill row for
 * account data that predates this feature. `sourceDocumentId` is absent on
 * that backfill row since it has no triggering upload.
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
