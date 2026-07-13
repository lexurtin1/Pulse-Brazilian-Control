import { InvariantViolationError } from "../shared/errors.js";
import type { AccountId, DealId, DocumentId } from "../shared/identifiers.js";
import { DealReviewStatus } from "./DealReviewStatus.js";
import { DealStage } from "./DealStage.js";

export interface DealProps {
  id: DealId;
  sourceDocumentId: DocumentId;
  sourceRowNumber: number;
  opportunityOwner?: string;
  accountNameRaw: string;
  opportunityName: string;
  stage: DealStage;
  fiscalPeriod: string;
  amount: number;
  expectedRevenue: number;
  probabilityPercent: number;
  ageDays?: number;
  revenueLiveDate?: Date;
  nextStepSummary?: string;
  leadSource?: string;
  type?: string;
  ownerRegion?: string;
  linkedAccountId?: AccountId;
  reviewStatus: DealReviewStatus;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

function assertValid(props: DealProps): void {
  if (!props.accountNameRaw.trim()) {
    throw new InvariantViolationError("Deal", "accountNameRaw must not be empty");
  }
  if (!props.opportunityName.trim()) {
    throw new InvariantViolationError("Deal", "opportunityName must not be empty");
  }
  if (props.amount < 0) {
    throw new InvariantViolationError("Deal", "amount must not be negative");
  }
  if (props.expectedRevenue < 0) {
    throw new InvariantViolationError("Deal", "expectedRevenue must not be negative");
  }
  if (props.probabilityPercent < 0 || props.probabilityPercent > 100) {
    throw new InvariantViolationError("Deal", "probabilityPercent must be between 0 and 100");
  }
}

/**
 * One Salesforce opportunity row from a Pipeline CSV upload, verbatim — a
 * Deal is created for every row regardless of stage or account-link
 * outcome, never dropped on import. "Open pipeline" is a read-time
 * predicate (`isOpen`), not an import-time filter: `Live` (already
 * closed-won, revenue flowing) and `Lost` (closed-lost) rows are stored
 * exactly like any other, just excluded by consumers that only want open
 * pipeline (Pipeline Value, Top Open Deals).
 *
 * There is no separate "PipelineSnapshot" entity — the owning `SourceDocument`
 * (declaredType PipelineDataset) already carries the one timestamp a
 * snapshot needs (`provenance.uploadedAt`); "the latest snapshot" is simply
 * "the most recently uploaded PipelineDataset SourceDocument," mirroring how
 * LocationRecord relates to SourceDocument.
 */
export class Deal {
  private constructor(private readonly props: DealProps) {}

  /** The normal ingestion path — a freshly parsed, valid CSV row becoming a Deal. */
  static receive(params: {
    id: DealId;
    sourceDocumentId: DocumentId;
    sourceRowNumber: number;
    opportunityOwner?: string;
    accountNameRaw: string;
    opportunityName: string;
    stage: DealStage;
    fiscalPeriod: string;
    amount: number;
    expectedRevenue: number;
    probabilityPercent: number;
    ageDays?: number;
    revenueLiveDate?: Date;
    nextStepSummary?: string;
    leadSource?: string;
    type?: string;
    ownerRegion?: string;
    linkedAccountId?: AccountId;
    reviewNotes?: string;
  }): Deal {
    const now = new Date();
    const props: DealProps = {
      id: params.id,
      sourceDocumentId: params.sourceDocumentId,
      sourceRowNumber: params.sourceRowNumber,
      opportunityOwner: params.opportunityOwner?.trim() || undefined,
      accountNameRaw: params.accountNameRaw.trim(),
      opportunityName: params.opportunityName.trim(),
      stage: params.stage,
      fiscalPeriod: params.fiscalPeriod.trim(),
      amount: params.amount,
      expectedRevenue: params.expectedRevenue,
      probabilityPercent: params.probabilityPercent,
      ageDays: params.ageDays,
      revenueLiveDate: params.revenueLiveDate,
      nextStepSummary: params.nextStepSummary?.trim() || undefined,
      leadSource: params.leadSource?.trim() || undefined,
      type: params.type?.trim() || undefined,
      ownerRegion: params.ownerRegion?.trim() || undefined,
      linkedAccountId: params.linkedAccountId,
      reviewStatus: DealReviewStatus.Pending,
      reviewNotes: params.reviewNotes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    assertValid(props);
    return new Deal(props);
  }

  /** Repository-only rehydration from stored fields, bypassing `receive()`'s ingestion-flow defaults. */
  static reconstruct(props: DealProps): Deal {
    assertValid(props);
    return new Deal(props);
  }

  get id(): DealId {
    return this.props.id;
  }
  get sourceDocumentId(): DocumentId {
    return this.props.sourceDocumentId;
  }
  get sourceRowNumber(): number {
    return this.props.sourceRowNumber;
  }
  get opportunityOwner(): string | undefined {
    return this.props.opportunityOwner;
  }
  get accountNameRaw(): string {
    return this.props.accountNameRaw;
  }
  get opportunityName(): string {
    return this.props.opportunityName;
  }
  get stage(): DealStage {
    return this.props.stage;
  }
  get fiscalPeriod(): string {
    return this.props.fiscalPeriod;
  }
  get amount(): number {
    return this.props.amount;
  }
  get expectedRevenue(): number {
    return this.props.expectedRevenue;
  }
  get probabilityPercent(): number {
    return this.props.probabilityPercent;
  }
  get ageDays(): number | undefined {
    return this.props.ageDays;
  }
  get revenueLiveDate(): Date | undefined {
    return this.props.revenueLiveDate;
  }
  get nextStepSummary(): string | undefined {
    return this.props.nextStepSummary;
  }
  get leadSource(): string | undefined {
    return this.props.leadSource;
  }
  get type(): string | undefined {
    return this.props.type;
  }
  get ownerRegion(): string | undefined {
    return this.props.ownerRegion;
  }
  get linkedAccountId(): AccountId | undefined {
    return this.props.linkedAccountId;
  }
  get reviewStatus(): DealReviewStatus {
    return this.props.reviewStatus;
  }
  get reviewNotes(): string | undefined {
    return this.props.reviewNotes;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** `Live` = already closed-won (revenue flowing); `Lost` = closed-lost. Neither is "open" pipeline. */
  get isOpen(): boolean {
    return this.props.stage !== DealStage.Live && this.props.stage !== DealStage.Lost;
  }

  private touch(patch: Partial<DealProps>): Deal {
    const props = { ...this.props, ...patch, updatedAt: new Date() };
    assertValid(props);
    return new Deal(props);
  }

  flagForReview(reason: string): Deal {
    return this.touch({ reviewStatus: DealReviewStatus.ReviewRequired, reviewNotes: reason.trim() });
  }

  approve(): Deal {
    return this.touch({ reviewStatus: DealReviewStatus.Approved });
  }

  /** Rejected deals are retained, never deleted — same convention as LocationRecord. */
  reject(reason: string): Deal {
    return this.touch({ reviewStatus: DealReviewStatus.Rejected, reviewNotes: reason.trim() });
  }

  withLinkedAccount(accountId: AccountId): Deal {
    return this.touch({ linkedAccountId: accountId });
  }
}
