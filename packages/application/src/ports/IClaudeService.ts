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

/** Either raw text or a base64-encoded PDF — Claude reads a PDF natively as a document content block, no parsing library needed. */
export type ClaudeDocumentContent = { kind: "text"; text: string } | { kind: "pdf"; base64Data: string };

/**
 * One candidate signal extracted from a document. `accountId` is null when
 * Claude found no match in the `knownAccounts` list it was given — never a
 * freely-invented id. Same primitives-only boundary convention as
 * ClaudeInsightResult: this has not yet been validated against domain
 * invariants or cross-checked against the real account list.
 */
export interface ClaudeExtractedSignalResult {
  accountId: string | null;
  title: string;
  summary: string;
  type: string;
  confidence: number;
  dateObserved: string | null;
}

export interface ClaudeExtractSignalsResult {
  signals: ClaudeExtractedSignalResult[];
  /** Company names the document mentioned that matched none of the supplied knownAccounts. */
  unmatchedAccountMentions: string[];
}

/** The one port through which the application layer talks to Claude. No SDK, no HTTP client — just this contract. */
export interface IClaudeService {
  generateInsight(params: { contextBundle: ContextBundle; promptProfile: PromptProfile }): Promise<ClaudeInsightResult>;
  extractSignalsFromDocument(params: {
    documentContent: ClaudeDocumentContent;
    knownAccounts: { id: string; name: string }[];
  }): Promise<ClaudeExtractSignalsResult>;
}
