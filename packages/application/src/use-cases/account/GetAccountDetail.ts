import type { Account, ExternalReference, OfficeLocation, TemperatureAssessment } from "@pulse-brazil/domain";
import { asAccountId } from "@pulse-brazil/domain";
import type {
  AccountDetailDto,
  ExternalReferenceDto,
  OfficeLocationDto,
} from "../../dto/account/AccountDetailDto.js";
import type { AccountLocationSummaryDto, AccountSummaryDto } from "../../dto/account/AccountSummaryDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IInsightRepository } from "../../ports/IInsightRepository.js";
import type { ISignalRepository } from "../../ports/ISignalRepository.js";
import type { ITemperatureAssessmentRepository } from "../../ports/ITemperatureAssessmentRepository.js";
import { toInsightDto } from "../insight/GenerateInsight.js";
import { toSignalDto } from "../signal/ListSignalsForAccount.js";

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
 * Full account dossier view. Deliberately asks the assessment repository
 * for the latest temperature rather than trusting Account.latestTemperature
 * — for a single-account detail view, one extra query buys certainty that
 * this is the authoritative read, not whatever the account aggregate
 * happened to have cached when it was loaded.
 */
export class GetAccountDetail {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly signals: ISignalRepository,
    private readonly temperature: ITemperatureAssessmentRepository,
    private readonly insights: IInsightRepository,
  ) {}

  async execute(id: string): Promise<AccountDetailDto | null> {
    if (!id.trim()) {
      throw new ValidationError("id is required");
    }
    const accountId = asAccountId(id);

    const account = await this.accounts.findById(accountId);
    if (!account) return null;

    const [latestTemperature, accountSignals, latestInsight] = await Promise.all([
      this.temperature.findLatestForAccount(accountId),
      this.signals.findByAccountId(accountId),
      this.insights.findLatestForAccount(accountId),
    ]);

    const recentSignals = [...accountSignals]
      .sort((a, b) => b.dateObserved.getTime() - a.dateObserved.getTime())
      .slice(0, RECENT_SIGNALS_LIMIT)
      .map(toSignalDto);

    return {
      ...toAccountSummaryDto(account, latestTemperature),
      officeLocations: account.officeLocations.map(toOfficeLocationDto),
      externalReferences: account.externalReferences.map(toExternalReferenceDto),
      linkedThemeIds: [...account.linkedThemeIds],
      recentSignals,
      latestInsight: latestInsight ? toInsightDto(latestInsight) : undefined,
    };
  }
}
