import { InvariantViolationError } from "./errors.js";

/**
 * The geography a piece of business meaning applies to — an account's home
 * market, or the geography a signal is relevant to. Deliberately coarse
 * (country/region/city labels), not a coordinate: precise anchoring belongs
 * to Coordinate/OfficeLocation. This is "what market," not "what pin."
 */
export class GeographicScope {
  private constructor(
    readonly countryCode: string,
    readonly region?: string,
    readonly city?: string,
  ) {}

  static of(params: { countryCode: string; region?: string; city?: string }): GeographicScope {
    const countryCode = params.countryCode.trim().toUpperCase();
    if (countryCode.length !== 2) {
      throw new InvariantViolationError("GeographicScope", "countryCode must be a 2-letter ISO 3166-1 alpha-2 code");
    }
    return new GeographicScope(countryCode, params.region?.trim(), params.city?.trim());
  }

  static brazil(params?: { region?: string; city?: string }): GeographicScope {
    return GeographicScope.of({ countryCode: "BR", region: params?.region, city: params?.city });
  }

  equals(other: GeographicScope): boolean {
    return this.countryCode === other.countryCode && this.region === other.region && this.city === other.city;
  }
}
