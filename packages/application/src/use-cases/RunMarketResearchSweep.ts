import {
  type Account,
  AccountStatus,
  asSignalId,
  ConfidenceScore,
  ConnectorSource,
  EvidenceKind,
  EvidenceReference,
  Signal,
  SignalOrigin,
  SignalType,
} from "@pulse-brazil/domain";
import type { RunMarketResearchSweepError, RunMarketResearchSweepResult } from "../dto/RunMarketResearchSweepResult.js";
import type { IAccountRepository } from "../ports/IAccountRepository.js";
import type { IIdGenerator } from "../ports/IIdGenerator.js";
import type { IMarketResearchService, MarketResearchRecency } from "../ports/IMarketResearchService.js";
import type { ISignalRepository } from "../ports/ISignalRepository.js";

/** No inputs today — present so a future scoped sweep (e.g. one account) has somewhere to add a parameter without breaking callers. */
export type RunMarketResearchSweepCommand = Record<string, never>;

interface ResearchQueryTemplate {
  category: string;
  question: string;
  recency: MarketResearchRecency;
}

/**
 * The three fixed research angles run for every account. Deliberately
 * account-name-only: themes and geography aren't woven into these templates.
 */
function buildQueryTemplates(accountName: string): ResearchQueryTemplate[] {
  return [
    { category: "News", question: `${accountName} Brazil market news`, recency: "P7D" },
    { category: "Procurement", question: `${accountName} procurement contracts Brazil`, recency: "P30D" },
    { category: "Leadership", question: `${accountName} executive appointments OR leadership changes Brazil`, recency: "P30D" },
  ];
}

const EXCERPT_MAX_LENGTH = 500;
/** No per-result confidence signal exists to derive one from — automated web research is treated as flat medium confidence until reviewed. */
const RESEARCH_SIGNAL_CONFIDENCE = 0.6;

/**
 * The daily automated market-research sweep: for every active account, runs
 * three fixed research queries (news, procurement, leadership) through
 * IMarketResearchService and records each result as a MachineDerived
 * Signal. Never throws on a single account's failure — a whole account
 * (all three queries) is treated as one unit; a failure anywhere within it
 * is collected into the result instead of stopping the rest of the sweep.
 */
export class RunMarketResearchSweep {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly signals: ISignalRepository,
    private readonly marketResearch: IMarketResearchService,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(_command: RunMarketResearchSweepCommand): Promise<RunMarketResearchSweepResult> {
    const allAccounts = await this.accounts.findAll();
    // Researched: accounts still being pursued or engaged (Prospect, Active).
    // Skipped: Dormant/Churned — no value spending research calls on
    // relationships that are already given up on.
    const activeAccounts = allAccounts.filter(
      (account) => account.status === AccountStatus.Active || account.status === AccountStatus.Prospect,
    );

    let signalsCreated = 0;
    const errors: RunMarketResearchSweepError[] = [];

    for (const account of activeAccounts) {
      try {
        signalsCreated += await this.processAccount(account);
      } catch (error) {
        errors.push({ accountId: account.id, message: error instanceof Error ? error.message : String(error) });
      }
    }

    return { accountsProcessed: activeAccounts.length, signalsCreated, errors };
  }

  private async processAccount(account: Account): Promise<number> {
    let updatedAccount = account;
    let created = 0;

    for (const template of buildQueryTemplates(account.name)) {
      const result = await this.marketResearch.research({ question: template.question, recency: template.recency });
      const [firstSource] = result.sources;

      const signal = Signal.of({
        id: asSignalId(this.idGenerator.newId()),
        source: ConnectorSource.WebResearch,
        type: SignalType.MarketResearch,
        title: `${template.category}: ${account.name}`,
        summary: result.answer,
        linkedAccountIds: [account.id],
        geographicScope: account.geographicScope,
        dateObserved: result.retrievedAt,
        evidence: [
          EvidenceReference.of({
            kind: EvidenceKind.ManualAssertion,
            excerpt: result.answer.slice(0, EXCERPT_MAX_LENGTH),
            locator: firstSource?.url,
          }),
        ],
        confidence: ConfidenceScore.of(RESEARCH_SIGNAL_CONFIDENCE),
        origin: SignalOrigin.MachineDerived,
      });

      await this.signals.save(signal);
      updatedAccount = updatedAccount.linkSignal(signal.id);
      created += 1;
    }

    if (created > 0) {
      await this.accounts.save(updatedAccount);
    }

    return created;
  }
}
