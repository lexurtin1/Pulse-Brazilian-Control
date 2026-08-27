import { DocumentType, type Account, type ExternalReference, type OfficeLocation, type TemperatureAssessment } from "@pulse-brazil/domain";
import { asAccountId } from "@pulse-brazil/domain";
import type {
  AccountDetailDto,
  ExternalReferenceDto,
  OfficeLocationDto,
} from "../../dto/account/AccountDetailDto.js";
import type { AccountLocationSummaryDto, AccountSummaryDto } from "../../dto/account/AccountSummaryDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IAccountResearchBriefRepository } from "../../ports/IAccountResearchBriefRepository.js";
import type { IDealRepository } from "../../ports/IDealRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { IInsightRepository } from "../../ports/IInsightRepository.js";
import type { ISignalRepository } from "../../ports/ISignalRepository.js";
import type { ITemperatureAssessmentRepository } from "../../ports/ITemperatureAssessmentRepository.js";
import { toInsightDto } from "../insight/GenerateInsight.js";
import { toDealDto } from "../pipeline/ImportPipelineCsv.js";
import { toSignalDto } from "../signal/ListSignalsForAccount.js";
import { toAccountResearchBriefDto } from "./RunAccountResearchSweep.js";

const RECENT_SIGNALS_LIMIT = 10;

/** Shared by ListAccounts too — the summary shape is the same wherever an Account is projected to a list row. */
export function toAccountSummaryDto(account: Account, latestTemperature: TemperatureAssessment | null): AccountSummaryDto {
  const primaryLocation: AccountLocationSummaryDto = {
    city: account.geographicScope.city,
    country: account.geographicScope.countryCode,
  };
  return {
    id: account.id,
    name: account.name,
    type: account.accountType,
    status: account.status,
    temperatureBand: latestTemperature?.band,
    clientTypes: [...account.clientTypes],
    primaryLocation,
    latestAssessmentDate: latestTemperature?.assessedAt.toISOString(),
  };
}

/** Shared by ResolveAccountCoordinate too — one mapping from OfficeLocation to its DTO shape. */
export function toOfficeLocationDto(office: OfficeLocation): OfficeLocationDto {
  const coordinate = office.bestAvailableCoordinate;
  return {
    id: office.id,
    rawAddress: office.rawAddress,
    normalizedAddress: office.normalizedAddress,
    coordinate: coordinate ? { latitude: coordinate.latitude, longitude: coordinate.longitude } : undefined,
    verificationState: office.verificationState,
    isPrimary: office.isPrimary,
  };
}

function toExternalReferenceDto(reference: ExternalReference): ExternalReferenceDto {
  return { system: reference.system, externalId: reference.externalId, url: reference.url };
}

/**
 * Full account dossier view. Current temperature is always projected from
 * canonical immutable assessment history.
 */
export class GetAccountDetail {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly signals: ISignalRepository,
    private readonly temperature: ITemperatureAssessmentRepository,
    private readonly insights: IInsightRepository,
    private readonly researchBriefs: IAccountResearchBriefRepository,
    private readonly deals: IDealRepository,
    private readonly documents: IDocumentRepository,
  ) {}

  async execute(id: string): Promise<AccountDetailDto | null> {
    if (!id.trim()) {
      throw new ValidationError("id is required");
    }
    const accountId = asAccountId(id);

    const account = await this.accounts.findById(accountId);
    if (!account) return null;

    const [latestTemperature, accountSignals, latestInsight, researchBrief, snapshots] = await Promise.all([
      this.temperature.findLatestForAccount(accountId),
      this.signals.findByAccountId(accountId),
      this.insights.findLatestForAccount(accountId),
      this.researchBriefs.findByAccountId(accountId),
      this.documents.findByDeclaredType(DocumentType.PipelineDataset),
    ]);

    const recentSignals = [...accountSignals]
      .sort((a, b) => b.dateObserved.getTime() - a.dateObserved.getTime())
      .slice(0, RECENT_SIGNALS_LIMIT)
      .map(toSignalDto);

    const [latestSnapshot] = snapshots;
    const latestDeals = latestSnapshot ? await this.deals.findBySourceDocumentId(latestSnapshot.id) : [];
    const openDeals = latestDeals.filter((deal) => deal.isOpen && deal.linkedAccountId === accountId);
    const openPipelineValue = openDeals.reduce((sum, deal) => sum + deal.amount, 0);

    return {
      ...toAccountSummaryDto(account, latestTemperature),
      officeLocations: account.officeLocations.map(toOfficeLocationDto),
      externalReferences: account.externalReferences.map(toExternalReferenceDto),
      linkedThemeIds: [...account.linkedThemeIds],
      recentSignals,
      latestInsight: latestInsight ? toInsightDto(latestInsight) : undefined,
      researchBrief: researchBrief ? toAccountResearchBriefDto(researchBrief) : undefined,
      openPipelineValue,
      openDeals: openDeals.sort((a, b) => b.amount - a.amount).map(toDealDto),
    };
  }
}
