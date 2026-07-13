import type { Account, OfficeLocation } from "@pulse-brazil/domain";
import type { AccountMapPinDto } from "../../dto/account/AccountMapPinDto.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";

function pickMapOfficeLocation(account: Account): OfficeLocation | undefined {
  const primary = account.primaryOfficeLocation;
  if (primary?.bestAvailableCoordinate) return primary;
  return account.officeLocations.find((office) => office.bestAvailableCoordinate);
}

/**
 * Map-ready account list — a lean view model for pin rendering, per
 * ARCHITECTURE_PRINCIPLES: "Application services should return map-oriented
 * view models, not rendering code." Uses Account.latestTemperature (the
 * denormalized snapshot) rather than a per-row assessment lookup, same
 * reasoning as ListAccounts — avoiding an N+1 across every pinned account.
 */
export class ListAccountsWithCoordinates {
  constructor(private readonly accounts: IAccountRepository) {}

  async execute(): Promise<AccountMapPinDto[]> {
    const accounts = await this.accounts.findAllWithCoordinates();

    const pins: AccountMapPinDto[] = [];
    for (const account of accounts) {
      const office = pickMapOfficeLocation(account);
      const coordinate = office?.bestAvailableCoordinate;
      if (!office || !coordinate) continue;

      pins.push({
        id: account.id,
        name: account.name,
        temperatureBand: account.latestTemperature?.band,
        clientTypes: [...account.clientTypes],
        coordinate: { latitude: coordinate.latitude, longitude: coordinate.longitude },
        verificationState: office.verificationState,
      });
    }
    return pins;
  }
}
