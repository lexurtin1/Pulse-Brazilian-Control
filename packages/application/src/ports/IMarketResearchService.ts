/** ISO 8601-style duration shorthand for how recent a source must be. null means no recency constraint. */
export type MarketResearchRecency = "P1D" | "P7D" | "P30D" | "P365D" | null;

export interface MarketResearchQuery {
  question: string;
  recency: MarketResearchRecency;
  /** Bullets from the last time this topic was checked, so the service can be asked to report only what's new since then. Empty/omitted means there's no prior state — everything found is "new". */
  priorBullets?: readonly string[];
}

export interface MarketResearchSource {
  url: string;
  title?: string;
  snippet?: string;
}

/**
 * The plain, structured shape a web-search-backed research call returns —
 * same reasoning as ClaudeInsightResult: primitives only, nothing
 * domain-typed yet, because this is the boundary where an external
 * system's output first lands. RunMarketResearchSweep converts this into
 * domain Signals, never persists it directly. `bullets` is empty when the
 * service judged there to be nothing new since `priorBullets` — the caller
 * skips creating a signal in that case rather than showing an empty card.
 */
export interface MarketResearchResult {
  bullets: string[];
  detail: string;
  sources: MarketResearchSource[];
  retrievedAt: Date;
}

/** The one port through which the application layer asks for web-search-backed market research. No SDK, no HTTP client — just this contract. */
export interface IMarketResearchService {
  research(query: MarketResearchQuery): Promise<MarketResearchResult>;
}
