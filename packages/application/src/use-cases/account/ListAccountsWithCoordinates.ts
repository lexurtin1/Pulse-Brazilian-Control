import { DocumentType, type Account, type OfficeLocation } from "@pulse-brazil/domain";
import type { AccountMapPinDto } from "../../dto/account/AccountMapPinDto.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IDealRepository } from "../../ports/IDealRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";

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
 *
 * openPipelineValue reads the same "latest snapshot" (most recently uploaded
 * PipelineDataset SourceDocument) as GetPipelineSummary/GetTopOpenDeals, summed
 * per linked account rather than market-wide.
 */
export class ListAccountsWithCoordinates {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly deals: IDealRepository,
    private readonly documents: IDocumentRepository,
  ) {}

  async execute(): Promise<AccountMapPinDto[]> {
    const [accounts, snapshots] = await Promise.all([
      this.accounts.findAllWithCoordinates(),
      this.documents.findByDeclaredType(DocumentType.PipelineDataset),
    ]);

    const [latestSnapshot] = snapshots;
    const latestDeals = latestSnapshot ? await this.deals.findBySourceDocumentId(latestSnapshot.id) : [];

    const openPipelineValueByAccountId = new Map<string, number>();
    for (const deal of latestDeals) {
      if (!deal.isOpen || !deal.linkedAccountId) continue;
      openPipelineValueByAccountId.set(
        deal.linkedAccountId,
        (openPipelineValueByAccountId.get(deal.linkedAccountId) ?? 0) + deal.amount,
      );
    }

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
        openPipelineValue: openPipelineValueByAccountId.get(account.id) ?? 0,
      });
    }
    return pins;
  }
}
