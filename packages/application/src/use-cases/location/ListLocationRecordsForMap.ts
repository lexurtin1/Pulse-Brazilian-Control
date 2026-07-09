import { asAccountId } from "@pulse-brazil/domain";
import type { LocationRecordMapPinDto } from "../../dto/location/LocationRecordMapPinDto.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { ILocationRecordRepository } from "../../ports/ILocationRecordRepository.js";

/**
 * What the map reads. Eligibility (resolved coordinate, not Rejected) is
 * decided once, in the repository query — this use case only shapes the
 * DTO, including a denormalized account name so the frontend doesn't need a
 * second round-trip per pin.
 */
export class ListLocationRecordsForMap {
  constructor(
    private readonly locationRecords: ILocationRecordRepository,
    private readonly accounts: IAccountRepository,
  ) {}

  async execute(): Promise<LocationRecordMapPinDto[]> {
    const records = await this.locationRecords.findAllEligibleForMap();

    const uniqueAccountIds = [...new Set(records.map((record) => record.linkedAccountId).filter((id) => id !== undefined))];
    const accountNames = new Map<string, string>();
    await Promise.all(
      uniqueAccountIds.map(async (id) => {
        const account = await this.accounts.findById(asAccountId(id));
        if (account) accountNames.set(id, account.name);
      }),
    );

    return records.map((record) => {
      const coordinate = record.bestAvailableCoordinate!; // findAllEligibleForMap guarantees this is present
      return {
        id: record.id,
        kind: record.kind,
        label: record.label,
        coordinate: { latitude: coordinate.latitude, longitude: coordinate.longitude },
        verificationState: record.verificationState,
        reviewStatus: record.reviewStatus,
        linkedAccountId: record.linkedAccountId,
        linkedAccountName: record.linkedAccountId ? accountNames.get(record.linkedAccountId) : undefined,
        eventDate: record.eventDate?.toISOString(),
      };
    });
  }
}
