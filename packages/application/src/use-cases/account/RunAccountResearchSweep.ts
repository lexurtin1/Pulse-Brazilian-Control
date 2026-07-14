import { AccountResearchBrief, asAccountId } from "@pulse-brazil/domain";
import type { AccountResearchBriefDto } from "../../dto/account/AccountResearchBriefDto.js";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IAccountResearchBriefRepository } from "../../ports/IAccountResearchBriefRepository.js";
import type { ICompanyResearchService } from "../../ports/ICompanyResearchService.js";

export function toAccountResearchBriefDto(brief: AccountResearchBrief): AccountResearchBriefDto {
  return {
    history: [...brief.history],
    competitiveIntel: [...brief.competitiveIntel],
    retrievedAt: brief.retrievedAt.toISOString(),
  };
}

/**
 * The manually-triggered "Information Sweep" for a single account — a real
 * Perplexity call, real spend, no novelty-diffing against a prior state
 * (unlike RunMarketResearchSweep): every run replaces whatever brief existed
 * before, in full, per the operator's explicit "replace, not append" request.
 */
export class RunAccountResearchSweep {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly briefs: IAccountResearchBriefRepository,
    private readonly companyResearch: ICompanyResearchService,
  ) {}

  async execute(id: string): Promise<AccountResearchBriefDto> {
    if (!id.trim()) {
      throw new ValidationError("id is required");
    }
    const accountId = asAccountId(id);

    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundError("Account", id);
    }

    const result = await this.companyResearch.researchCompany({ accountName: account.name });

    const brief = AccountResearchBrief.of({
      accountId,
      history: result.history,
      competitiveIntel: result.competitiveIntel,
      retrievedAt: result.retrievedAt,
    });
    await this.briefs.save(brief);

    return toAccountResearchBriefDto(brief);
  }
}
