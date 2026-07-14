import {
  asSignalId,
  ConfidenceScore,
  ConnectorSource,
  EvidenceKind,
  EvidenceReference,
  GeographicScope,
  Signal,
  SignalOrigin,
  SignalType,
} from "@pulse-brazil/domain";
import type { RunMarketResearchSweepError, RunMarketResearchSweepResult } from "../dto/RunMarketResearchSweepResult.js";
import type { IIdGenerator } from "../ports/IIdGenerator.js";
import type { IMarketResearchLogRepository } from "../ports/IMarketResearchLogRepository.js";
import type { IMarketResearchService, MarketResearchRecency } from "../ports/IMarketResearchService.js";
import type { ISignalRepository } from "../ports/ISignalRepository.js";

interface MarketSweepTopic {
  label: string;
  type: SignalType;
  question: string;
  recency: MarketResearchRecency;
}

/**
 * The fixed set of market-wide research angles run every sweep — deliberately
 * not account-specific. Each maps 1:1 to a SignalType so the live feed's
 * filter chips line up with what the sweep actually produces.
 */
const MARKET_SWEEP_TOPICS: MarketSweepTopic[] = [
  {
    label: "Competitor movements",
    type: SignalType.CompetitiveIntelligence,
    question:
      "What are Allfunds and other fund order-routing or fund distribution competitors of Calastone doing in Brazil recently — new partnerships, product launches, client wins, or expansion moves?",
    recency: "P7D",
  },
  {
    label: "Regulatory change",
    type: SignalType.RegulatoryChange,
    question:
      "What regulatory changes affecting the Brazilian asset management or fund distribution industry have happened recently, including pension reform?",
    recency: "P7D",
  },
  {
    label: "Cross-border investment",
    type: SignalType.CrossBorder,
    question:
      "What recent changes or developments affect cross-border investment flows into or out of Brazil for funds and asset managers?",
    recency: "P7D",
  },
  {
    label: "Tokenisation",
    type: SignalType.Tokenisation,
    question:
      "What recent developments are there in tokenisation of funds or securities in Brazil, or affecting the Brazilian asset management market?",
    recency: "P7D",
  },
  {
    label: "ETF market",
    type: SignalType.ETF,
    question: "What recent news is there about ETFs in the Brazilian market — new launches, regulatory changes, or flows?",
    recency: "P7D",
  },
  {
    label: "General market movements",
    type: SignalType.MarketStructure,
    question:
      "What overall Brazilian fund distribution and asset management market news or movements have happened recently — AUM trends, new entrants, or shifts in distribution models?",
    recency: "P7D",
  },
];

const EXCERPT_MAX_LENGTH = 500;
/** No per-result confidence signal exists to derive one from — automated web research is treated as flat medium confidence until reviewed. */
const RESEARCH_SIGNAL_CONFIDENCE = 0.6;

/**
 * The recurring automated market-research sweep: for each of the fixed
 * MARKET_SWEEP_TOPICS, asks IMarketResearchService for developments since
 * the last time that topic was checked, and records genuinely new findings
 * as a MachineDerived Signal tagged with that topic's SignalType. Deliberately
 * not account-specific — see the topic list above. A topic reporting nothing
 * new produces no signal at all, never a placeholder. Never throws on a
 * single topic's failure — it's collected into the result instead of
 * stopping the rest of the sweep.
 */
export class RunMarketResearchSweep {
  constructor(
    private readonly signals: ISignalRepository,
    private readonly marketResearch: IMarketResearchService,
    private readonly idGenerator: IIdGenerator,
    private readonly marketResearchLog: IMarketResearchLogRepository,
  ) {}

  async execute(): Promise<RunMarketResearchSweepResult> {
    let signalsCreated = 0;
    const errors: RunMarketResearchSweepError[] = [];

    for (const topic of MARKET_SWEEP_TOPICS) {
      try {
        if (await this.processTopic(topic)) {
          signalsCreated += 1;
        }
      } catch (error) {
        errors.push({ topic: topic.label, message: error instanceof Error ? error.message : String(error) });
      }
    }

    return { topicsProcessed: MARKET_SWEEP_TOPICS.length, signalsCreated, errors };
  }

  private async processTopic(topic: MarketSweepTopic): Promise<boolean> {
    const previous = await this.signals.findMostRecentByType(topic.type);
    const priorBullets = previous ? previous.summary.split("\n").filter((line) => line.trim().length > 0) : [];

    const result = await this.marketResearch.research({
      question: topic.question,
      recency: topic.recency,
      priorBullets,
    });

    // Logged whether or not the topic found anything new — this is the
    // record that the sweep actually ran, independent of GetDashboardFreshness's
    // other signal (Signals only exist for topics with genuine findings).
    await this.marketResearchLog.logAttempt({
      id: this.idGenerator.newId(),
      accountId: null,
      question: topic.question,
      answer: result.detail,
      sources: result.sources,
      retrievedAt: result.retrievedAt,
    });

    if (result.bullets.length === 0) {
      return false;
    }

    const evidence =
      result.sources.length > 0
        ? result.sources.map((source, index) =>
            EvidenceReference.of({
              kind: EvidenceKind.ManualAssertion,
              excerpt: index === 0 ? result.detail.slice(0, EXCERPT_MAX_LENGTH) : source.snippet?.slice(0, EXCERPT_MAX_LENGTH),
              locator: source.url,
            }),
          )
        : [
            EvidenceReference.of({
              kind: EvidenceKind.ManualAssertion,
              excerpt: result.detail.slice(0, EXCERPT_MAX_LENGTH),
            }),
          ];

    const signal = Signal.of({
      id: asSignalId(this.idGenerator.newId()),
      source: ConnectorSource.WebResearch,
      type: topic.type,
      title: result.headline || topic.label,
      summary: result.bullets.join("\n"),
      geographicScope: GeographicScope.brazil(),
      dateObserved: result.retrievedAt,
      evidence,
      confidence: ConfidenceScore.of(RESEARCH_SIGNAL_CONFIDENCE),
      origin: SignalOrigin.MachineDerived,
    });

    await this.signals.save(signal);
    return true;
  }
}
