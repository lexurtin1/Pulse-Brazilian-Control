import type { ContextBundle, PromptProfile } from "@pulse-brazil/domain";

/**
 * The plain, structured shape a Claude call returns — deliberately not
 * `Insight` or any other domain type. Fields are primitives (strings for
 * kinds/ids, a raw 0-1 number for confidence) because this is the boundary
 * where an external system's output first lands: it has not yet been
 * validated against domain invariants. `GenerateInsight` is responsible for
 * parsing this into branded ids, enum values, and ultimately `Insight.of(...)`.
 * Never a raw string blob — that would make the output unparseable and
 * unauditable by construction.
 */
export interface ClaudeRelatedEntityResult {
  kind: string;
  id: string;
}

export interface ClaudeEvidenceResult {
  kind: string;
  referenceId?: string;
  excerpt?: string;
  locator?: string;
}

export interface ClaudeRecommendedActionResult {
  description: string;
  dueDate?: string;
}

export interface ClaudeInsightResult {
  summary: string;
  whyItMatters: string;
  relatedEntities: ClaudeRelatedEntityResult[];
  evidence: ClaudeEvidenceResult[];
  confidence: number;
  recommendedAction?: ClaudeRecommendedActionResult;
}

/** The one port through which the application layer talks to Claude. No SDK, no HTTP client — just this contract. */
export interface IClaudeService {
  generateInsight(params: { contextBundle: ContextBundle; promptProfile: PromptProfile }): Promise<ClaudeInsightResult>;
}
