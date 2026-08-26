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

export type ClaudeImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/**
 * What a document arrives as. Claude reads a PDF or an image natively as a
 * content block, so neither needs a parsing library here; anything else the
 * uploader can decode to text (docx, eml, md) arrives already flattened.
 */
export type ClaudeDocumentContent =
  | { kind: "text"; text: string }
  | { kind: "pdf"; base64Data: string }
  | { kind: "image"; base64Data: string; mediaType: ClaudeImageMediaType };

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

/**
 * Claude's proposal for the Brazil "latest update" card, present only when
 * the document actually reports contact with a counterparty. Dates are
 * unvalidated ISO strings and `accountId` may name an account that does not
 * exist — ApplyExtractedUpdate is what makes both safe.
 */
export interface ClaudeExpansionUpdateDraft {
  headline: string | null;
  lastContact: {
    occurredAt: string | null;
    accountId: string | null;
    contactNames: string[];
    discussed: string;
  } | null;
  nextMeeting: {
    scheduledFor: string | null;
    withWhom: string;
    purpose: string;
  } | null;
  awaitingInternal: string[];
  nextActions: string[];
}

export interface ClaudeReadDocumentResult {
  /** Claude's classification, as a DocumentType member name — validated against the enum before it ever reaches a SourceDocument. */
  documentType: string;
  signals: ClaudeExtractedSignalResult[];
  /** Company names the document mentioned that matched none of the supplied knownAccounts. */
  unmatchedAccountMentions: string[];
  latestUpdate: ClaudeExpansionUpdateDraft | null;
}

/** The one port through which the application layer talks to Claude. No SDK, no HTTP client — just this contract. */
export interface IClaudeService {
  generateInsight(params: { contextBundle: ContextBundle; promptProfile: PromptProfile }): Promise<ClaudeInsightResult>;
  /**
   * One call classifies the document, extracts its signals, and drafts the
   * Brazil update. Three round trips over the same content would cost three
   * times as much and could disagree with each other about what it says.
   */
  readDocument(params: {
    documentContent: ClaudeDocumentContent;
    knownAccounts: { id: string; name: string }[];
  }): Promise<ClaudeReadDocumentResult>;
}
