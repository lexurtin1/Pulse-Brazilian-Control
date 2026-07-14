import { DocumentType, type Account, type OfficeLocation } from "@pulse-brazil/domain";
import type { AccountMapPinDto } from "../../dto/account/AccountMapPinDto.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IDealRepository } from "../../ports/IDealRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { ITemperatureAssessmentRepository } from "../../ports/ITemperatureAssessmentRepository.js";

function pickMapOfficeLocation(account: Account): OfficeLocation | undefined {
  const primary = account.primaryOfficeLocation;
  if (primary?.bestAvailableCoordinate) return primary;
  return account.officeLocations.find((office) => office.bestAvailableCoordinate);
}

/**
 * Map-ready account list — a lean view model for pin rendering, per
 * ARCHITECTURE_PRINCIPLES: "Application services should return map-oriented
 * view models, not rendering code." Current temperature is loaded from the
 * canonical assessment history in one bulk query.
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
    private readonly temperature: ITemperatureAssessmentRepository,
  ) {}

  async execute(): Promise<AccountMapPinDto[]> {
    const [accounts, snapshots] = await Promise.all([
      this.accounts.findAllWithCoordinates(),
      this.documents.findByDeclaredType(DocumentType.PipelineDataset),
    ]);
    const latestTemperatureByAccountId = await this.temperature.findLatestForAccounts(accounts.map((account) => account.id));

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
        temperatureBand: latestTemperatureByAccountId.get(account.id)?.band,
        clientTypes: [...account.clientTypes],
        coordinate: { latitude: coordinate.latitude, longitude: coordinate.longitude },
        verificationState: office.verificationState,
        openPipelineValue: openPipelineValueByAccountId.get(account.id) ?? 0,
      });
    }
    return pins;
  }
}
