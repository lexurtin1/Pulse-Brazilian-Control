import { InvariantViolationError } from "../shared/errors.js";
import type { OfficeLocationId } from "../shared/identifiers.js";
import { Coordinate } from "./Coordinate.js";
import { LocationVerificationState } from "./LocationVerificationState.js";

interface OfficeLocationProps {
  id: OfficeLocationId;
  rawAddress: string;
  normalizedAddress?: string;
  unverifiedCoordinate?: Coordinate;
  verifiedCoordinate?: Coordinate;
  verificationState: LocationVerificationState;
  isPrimary: boolean;
}

/**
 * An account's office as a place on the map — deliberately entity-shaped
 * (has an id, changes over time) rather than a value object, because the
 * whole point is that its coordinate is provisional until reviewed and may
 * be corrected more than once. All state changes return a new instance.
 */
export class OfficeLocation {
  private constructor(private readonly props: OfficeLocationProps) {}

  static fromRawAddress(params: {
    id: OfficeLocationId;
    rawAddress: string;
    normalizedAddress?: string;
    isPrimary: boolean;
  }): OfficeLocation {
    if (!params.rawAddress.trim()) {
      throw new InvariantViolationError("OfficeLocation", "rawAddress must not be empty");
    }
    return new OfficeLocation({
      id: params.id,
      rawAddress: params.rawAddress.trim(),
      normalizedAddress: params.normalizedAddress?.trim(),
      verificationState: LocationVerificationState.Unverified,
      isPrimary: params.isPrimary,
    });
  }

  get id(): OfficeLocationId {
    return this.props.id;
  }
  get rawAddress(): string {
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
  get isPrimary(): boolean {
    return this.props.isPrimary;
  }

  /** The coordinate map rendering should trust today, if any exists yet. */
  get bestAvailableCoordinate(): Coordinate | undefined {
    return this.props.verifiedCoordinate ?? this.props.unverifiedCoordinate;
  }

  /** Record a geocoder's guess. Does not make the location trustworthy on its own. */
  withGeocodedCoordinate(coordinate: Coordinate): OfficeLocation {
    return new OfficeLocation({
      ...this.props,
      unverifiedCoordinate: coordinate,
      verificationState: LocationVerificationState.GeocodedPendingReview,
    });
  }

  /** A human confirms the geocoded (or otherwise pending) coordinate is correct. */
  verify(coordinate: Coordinate): OfficeLocation {
    return new OfficeLocation({
      ...this.props,
      verifiedCoordinate: coordinate,
      verificationState: LocationVerificationState.ManuallyVerified,
    });
  }

  /** A human supplies their own coordinate, replacing whatever the geocoder produced. */
  override(coordinate: Coordinate): OfficeLocation {
    return new OfficeLocation({
      ...this.props,
      verifiedCoordinate: coordinate,
      verificationState: LocationVerificationState.ManuallyOverridden,
    });
  }

  withPrimary(isPrimary: boolean): OfficeLocation {
    return new OfficeLocation({ ...this.props, isPrimary });
  }
}
