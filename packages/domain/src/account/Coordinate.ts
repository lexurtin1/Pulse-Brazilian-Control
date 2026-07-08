import { InvariantViolationError } from "../shared/errors.js";

/** A validated latitude/longitude pair. Never carries verification state itself — see OfficeLocation. */
export class Coordinate {
  private constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  static of(latitude: number, longitude: number): Coordinate {
    if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
      throw new InvariantViolationError("Coordinate", "latitude must be between -90 and 90");
    }
    if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
      throw new InvariantViolationError("Coordinate", "longitude must be between -180 and 180");
    }
    return new Coordinate(latitude, longitude);
  }

  equals(other: Coordinate): boolean {
    return this.latitude === other.latitude && this.longitude === other.longitude;
  }
}
