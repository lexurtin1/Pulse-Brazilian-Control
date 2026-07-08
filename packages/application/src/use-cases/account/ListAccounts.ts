import type { AccountSummaryDto } from "../../dto/account/AccountSummaryDto.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import { toAccountSummaryDto } from "./GetAccountDetail.js";

/**
 * List-view projection of every account. Uses Account.latestTemperature
 * (the snapshot denormalized onto the aggregate) rather than querying the
 * assessment repository per row — GetAccountDetail pays for an authoritative
 * re-check because it's a single account; doing that 47 times here would be
 * an avoidable N+1.
 */
export class ListAccounts {
  constructor(private readonly accounts: IAccountRepository) {}

  async execute(): Promise<AccountSummaryDto[]> {
    const accounts = await this.accounts.findAll();
    return accounts.map((account) => toAccountSummaryDto(account, account.latestTemperature ?? null));
  }
}
