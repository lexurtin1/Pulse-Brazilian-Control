import { InvariantViolationError } from "../shared/errors.js";
import type { AccountId, DocumentId, LocationRecordId, SignalId } from "../shared/identifiers.js";
import { Coordinate } from "../account/Coordinate.js";
import { LocationVerificationState } from "../account/LocationVerificationState.js";
import { LocationRecordKind } from "./LocationRecordKind.js";
import { RawAddressInput } from "./RawAddressInput.js";
import { RecordReviewStatus } from "./RecordReviewStatus.js";

export interface LocationRecordProps {
  id: LocationRecordId;
  kind: LocationRecordKind;
  label: string;
  rawAddress: RawAddressInput;
  normalizedAddress?: string;
  unverifiedCoordinate?: Coordinate;
  verifiedCoordinate?: Coordinate;
  verificationState: LocationVerificationState;
  reviewStatus: RecordReviewStatus;
  linkedAccountId?: AccountId;
  linkedSignalId?: SignalId;
  eventDate?: Date;
  isPrimary: boolean;
  countryCode: string;
  sourceDocumentId: DocumentId;
  sourceRowNumber: number;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

function assertValid(props: LocationRecordProps): void {
  if (!props.label.trim()) {
    throw new InvariantViolationError("LocationRecord", "label must not be empty");
  }
  if (props.countryCode.trim().length !== 2) {
    throw new InvariantViolationError("LocationRecord", "countryCode must be a 2-letter ISO 3166-1 alpha-2 code");
  }
  if ((props.kind === LocationRecordKind.Event || props.kind === LocationRecordKind.Visit) && !props.eventDate) {
    throw new InvariantViolationError("LocationRecord", "eventDate is required when kind is Event or Visit");
  }
  if (props.isPrimary && props.kind !== LocationRecordKind.Office) {
    throw new InvariantViolationError("LocationRecord", "isPrimary is only meaningful when kind is Office");
  }
  if (props.rawAddress.isEmpty && !props.verifiedCoordinate && !props.unverifiedCoordinate) {
    throw new InvariantViolationError(
      "LocationRecord",
      "a record must supply either an address or a coordinate — it cannot have neither",
    );
  }
}

/**
 * The single reusable, kind-agnostic spatial fact Pulse Brazil places on the
 * map — an office, event, visit, or signal location, whether or not an
 * Account exists yet to link it to. This is the durable, reviewable spatial
 * truth the map reads from; it does not replace OfficeLocation (which stays
 * as-is, embedded in Account), it generalizes the same lifecycle
 * (raw -> geocoded -> human-verified-or-overridden) to records that don't
 * necessarily belong to one account.
 *
 * `reviewStatus` is deliberately independent of `verificationState`: the
 * latter is purely about whether the *coordinate* is trusted; the former is
 * about whether a human needs to look at the *record* at all, which can be
 * true for reasons that have nothing to do with the coordinate (an
 * ambiguous account-name match, a suspected duplicate row).
 */
export class LocationRecord {
  private constructor(private readonly props: LocationRecordProps) {}

  /** The normal ingestion path — a freshly parsed, valid CSV row (or equivalent) becoming a record. */
  static receive(params: {
    id: LocationRecordId;
    kind: LocationRecordKind;
    label: string;
    rawAddress: RawAddressInput;
    manualCoordinate?: Coordinate;
    linkedAccountId?: AccountId;
    linkedSignalId?: SignalId;
    eventDate?: Date;
    isPrimary?: boolean;
    countryCode?: string;
    sourceDocumentId: DocumentId;
    sourceRowNumber: number;
    reviewNotes?: string;
  }): LocationRecord {
    const now = new Date();
    // A CSV row may supply lat/lon directly instead of (or alongside) an
    // address — that's itself a form of manual override, landing straight
    // in ManuallyOverridden rather than waiting on a geocoder.
    const props: LocationRecordProps = {
      id: params.id,
      kind: params.kind,
      label: params.label.trim(),
      rawAddress: params.rawAddress,
      verifiedCoordinate: params.manualCoordinate,
      verificationState: params.manualCoordinate
        ? LocationVerificationState.ManuallyOverridden
        : LocationVerificationState.Unverified,
      reviewStatus: RecordReviewStatus.Pending,
      linkedAccountId: params.linkedAccountId,
      linkedSignalId: params.linkedSignalId,
      eventDate: params.eventDate,
      isPrimary: params.isPrimary ?? false,
      countryCode: (params.countryCode ?? "BR").trim().toUpperCase(),
      sourceDocumentId: params.sourceDocumentId,
      sourceRowNumber: params.sourceRowNumber,
      reviewNotes: params.reviewNotes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    assertValid(props);
    return new LocationRecord(props);
  }

  /**
   * Repository-only rehydration from stored fields, bypassing `receive()`'s
   * ingestion-flow defaults (Pending/Unverified) since a persisted record
   * may be in any state. Still runs the same invariant check — storage
   * should never produce an invalid record, but this doesn't trust that
   * blindly.
   */
  static reconstruct(props: LocationRecordProps): LocationRecord {
    assertValid(props);
    return new LocationRecord(props);
  }

  get id(): LocationRecordId {
    return this.props.id;
  }
  get kind(): LocationRecordKind {
    return this.props.kind;
  }
  get label(): string {
    return this.props.label;
  }
  get rawAddress(): RawAddressInput {
    return this.props.rawAddress;
  }
  get normalizedAddress(): string | undefined {
    return this.props.normalizedAddress;
  }
  get unverifiedCoordinate(): Coordinate | undefined {
    return this.props.unverifiedCoordinate;
  }
  get verifiedCoordinate(): Coordinate | undefined {
    return this.props.verifiedCoordinate;
  }
  get verificationState(): LocationVerificationState {
    return this.props.verificationState;
  }
  get reviewStatus(): RecordReviewStatus {
    return this.props.reviewStatus;
  }
  get linkedAccountId(): AccountId | undefined {
    return this.props.linkedAccountId;
  }
  get linkedSignalId(): SignalId | undefined {
    return this.props.linkedSignalId;
  }
  get eventDate(): Date | undefined {
    return this.props.eventDate;
  }
  get isPrimary(): boolean {
    return this.props.isPrimary;
  }
  get countryCode(): string {
    return this.props.countryCode;
  }
  get sourceDocumentId(): DocumentId {
    return this.props.sourceDocumentId;
  }
  get sourceRowNumber(): number {
    return this.props.sourceRowNumber;
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

  /** The coordinate map rendering should trust today, if any exists yet. */
  get bestAvailableCoordinate(): Coordinate | undefined {
    return this.props.verifiedCoordinate ?? this.props.unverifiedCoordinate;
  }

  /** A pin can be drawn — not the same as "fully trusted"; ReviewRequired/Pending records are still shown, distinguishably. */
  get isEligibleForMapPlacement(): boolean {
    return this.bestAvailableCoordinate !== undefined && this.props.reviewStatus !== RecordReviewStatus.Rejected;
  }

  private touch(patch: Partial<LocationRecordProps>): LocationRecord {
    const props = { ...this.props, ...patch, updatedAt: new Date() };
    assertValid(props);
    return new LocationRecord(props);
  }

  /** Record a geocoder's guess. Does not make the location trustworthy on its own. */
  withGeocodedCoordinate(coordinate: Coordinate): LocationRecord {
    return this.touch({
      unverifiedCoordinate: coordinate,
      verificationState: LocationVerificationState.GeocodedPendingReview,
    });
  }

  /** A human confirms the geocoded (or otherwise pending) coordinate is correct. */
  verify(coordinate: Coordinate): LocationRecord {
    return this.touch({
      verifiedCoordinate: coordinate,
      verificationState: LocationVerificationState.ManuallyVerified,
    });
  }

  /** A human supplies their own coordinate, replacing whatever the geocoder produced. */
  override(coordinate: Coordinate, reviewNotes?: string): LocationRecord {
    return this.touch({
      verifiedCoordinate: coordinate,
      verificationState: LocationVerificationState.ManuallyOverridden,
      reviewNotes: reviewNotes?.trim() || this.props.reviewNotes,
    });
  }

  approve(): LocationRecord {
    return this.touch({ reviewStatus: RecordReviewStatus.Approved });
  }

  flagForReview(reason: string): LocationRecord {
    return this.touch({ reviewStatus: RecordReviewStatus.ReviewRequired, reviewNotes: reason.trim() });
  }

  /** Rejected records are retained, never deleted — "why did this pin disappear" always has an answer. */
  reject(reason: string): LocationRecord {
    return this.touch({ reviewStatus: RecordReviewStatus.Rejected, reviewNotes: reason.trim() });
  }

  withNormalizedAddress(normalizedAddress: string): LocationRecord {
    return this.touch({ normalizedAddress: normalizedAddress.trim() || undefined });
  }
}
