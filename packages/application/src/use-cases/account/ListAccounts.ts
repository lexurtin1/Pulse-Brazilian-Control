import type { AccountSummaryDto } from "../../dto/account/AccountSummaryDto.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { ITemperatureAssessmentRepository } from "../../ports/ITemperatureAssessmentRepository.js";
import { toAccountSummaryDto } from "./GetAccountDetail.js";

/**
 * List-view projection of every account with one bulk query for canonical
 * latest assessments, avoiding both a mirrored snapshot and an N+1.
 */
export class ListAccounts {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly temperature: ITemperatureAssessmentRepository,
  ) {}

  async execute(): Promise<AccountSummaryDto[]> {
    const accounts = await this.accounts.findAll();
    const latestByAccountId = await this.temperature.findLatestForAccounts(accounts.map((account) => account.id));
    return accounts.map((account) => toAccountSummaryDto(account, latestByAccountId.get(account.id) ?? null));
  }
}
