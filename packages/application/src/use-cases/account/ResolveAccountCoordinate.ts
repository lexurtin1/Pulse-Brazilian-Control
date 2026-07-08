import { asAccountId } from "@pulse-brazil/domain";
import type { OfficeLocationDto } from "../../dto/account/AccountDetailDto.js";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IGeocoder } from "../../ports/IGeocoder.js";
import { toOfficeLocationDto } from "./GetAccountDetail.js";

export interface ResolveAccountCoordinateCommand {
  accountId: string;
}

/**
 * The key geo-resolution workflow: geocodes an account's primary office
 * location and records the result. Operates on the primary office only —
 * the one used for map rendering — not an arbitrary one of an account's
 * possibly-multiple offices.
 *
 * Geocoding a coordinate never verifies it — OfficeLocation.withGeocodedCoordinate
 * lands the location in GeocodedPendingReview, exactly as it would for a
 * human-entered address. A human still has to confirm or override it. If
 * the geocoder finds no match, that's an expected outcome (per IGeocoder),
 * not a failure: the office location is returned unchanged.
 */
export class ResolveAccountCoordinate {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly geocoder: IGeocoder,
  ) {}

  async execute(command: ResolveAccountCoordinateCommand): Promise<OfficeLocationDto> {
    if (!command.accountId.trim()) {
      throw new ValidationError("accountId is required");
    }
    const accountId = asAccountId(command.accountId);

    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundError("Account", command.accountId);
    }

    const primaryOffice = account.primaryOfficeLocation;
    if (!primaryOffice) {
      throw new ValidationError(`Account ${command.accountId} has no primary office location to resolve`);
    }

    const coordinate = await this.geocoder.geocode(primaryOffice.normalizedAddress ?? primaryOffice.rawAddress);
    if (!coordinate) {
      return toOfficeLocationDto(primaryOffice);
    }

    const updatedOffice = primaryOffice.withGeocodedCoordinate(coordinate);
    const updatedOfficeLocations = account.officeLocations.map((office) =>
      office.id === primaryOffice.id ? updatedOffice : office,
    );
    const updatedAccount = account.withOfficeLocations(updatedOfficeLocations);

    await this.accounts.save(updatedAccount);
    return toOfficeLocationDto(updatedOffice);
  }
}
