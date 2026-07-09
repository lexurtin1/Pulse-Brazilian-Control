/**
 * Exactly what a CSV row (or other ingestion source) said the address was —
 * kept as separate structured fields, never collapsed into one string, so a
 * reviewer can see field-by-field what a later normalization step changed.
 * Deliberately permissive: every field is optional, since a row may supply
 * a coordinate directly instead of an address (see LocationRecord).
 */
export class RawAddressInput {
  private constructor(
    readonly addressLine?: string,
    readonly city?: string,
    readonly state?: string,
    readonly postalCode?: string,
    readonly country?: string,
  ) {}

  static of(params: {
    addressLine?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }): RawAddressInput {
    return new RawAddressInput(
      params.addressLine?.trim() || undefined,
      params.city?.trim() || undefined,
      params.state?.trim() || undefined,
      params.postalCode?.trim() || undefined,
      params.country?.trim() || undefined,
    );
  }

  static empty(): RawAddressInput {
    return new RawAddressInput();
  }

  /** True when no address field was supplied at all — valid only when a manual coordinate was given instead. */
  get isEmpty(): boolean {
    return !this.addressLine && !this.city && !this.state && !this.postalCode && !this.country;
  }

  /** A single geocoder-ready line — joins whatever fields are present, in order. */
  toSingleLine(): string {
    return [this.addressLine, this.city, this.state, this.postalCode, this.country].filter(Boolean).join(", ");
  }
}
