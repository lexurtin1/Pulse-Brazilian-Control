import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeDocumentContent, ClaudeInsightResult, ClaudeReadDocumentResult, IClaudeService } from "@pulse-brazil/application";
import { DocumentType, type ContextBundle, type EvidenceReference, type PromptProfile } from "@pulse-brazil/domain";

const MODEL = "claude-opus-5";
const TOOL_NAME = "record_insight";
const READ_DOCUMENT_TOOL_NAME = "read_document";

const here = path.dirname(fileURLToPath(import.meta.url));
/** packages/infrastructure/src/adapters -> repo root/claude/prompts, whether running from src (tsx) or a future dist build (same directory depth). */
const DEFAULT_PROMPTS_BASE_DIR = path.resolve(here, "..", "..", "..", "..", "claude", "prompts");

const RECORD_INSIGHT_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    whyItMatters: { type: "string" },
    relatedEntities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["Account", "Theme", "Signal", "SourceDocument", "Note"] },
          id: { type: "string" },
        },
        required: ["kind", "id"],
        additionalProperties: false,
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["Note", "SourceDocument", "Signal", "ExternalReference", "ManualAssertion"] },
          referenceId: { type: ["string", "null"] },
          excerpt: { type: ["string", "null"] },
          locator: { type: ["string", "null"] },
        },
        required: ["kind", "referenceId", "excerpt", "locator"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number" },
    recommendedAction: {
      type: ["object", "null"],
      properties: {
        description: { type: "string" },
        dueDate: { type: ["string", "null"] },
      },
      required: ["description", "dueDate"],
      additionalProperties: false,
    },
  },
  required: ["summary", "whyItMatters", "relatedEntities", "evidence", "confidence", "recommendedAction"],
  additionalProperties: false,
};

/** The shape Claude's tool_use.input arrives in — nullable fields per the strict JSON schema above, converted to undefined when mapped into ClaudeInsightResult. */
interface RecordInsightToolInput {
  summary: string;
  whyItMatters: string;
  relatedEntities: { kind: string; id: string }[];
  evidence: { kind: string; referenceId: string | null; excerpt: string | null; locator: string | null }[];
  confidence: number;
  recommendedAction: { description: string; dueDate: string | null } | null;
}

/**
 * The strict schema behind `read_document`. Every optional-in-spirit field is
 * declared `["...", "null"]` and listed in `required` because strict mode
 * forbids a missing key — "absent" has to be spelled as an explicit null.
 */
const READ_DOCUMENT_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    documentType: { type: "string", enum: Object.values(DocumentType) },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          accountId: { type: ["string", "null"] },
          title: { type: "string" },
          summary: { type: "string" },
          type: {
            type: "string",
            enum: [
              "RegulatoryChange",
              "CompetitiveIntelligence",
              "MarketStructure",
              "CrossBorder",
              "Tokenisation",
              "ETF",
              "OrderRouting",
              "AccountSpecific",
              "MarketResearch",
              "Other",
            ],
          },
          confidence: { type: "number" },
          dateObserved: { type: ["string", "null"] },
        },
        required: ["accountId", "title", "summary", "type", "confidence", "dateObserved"],
        additionalProperties: false,
      },
    },
    unmatchedAccountMentions: {
      type: "array",
      items: { type: "string" },
    },
    latestUpdate: {
      type: ["object", "null"],
      properties: {
        headline: { type: ["string", "null"] },
        lastContact: {
          type: ["object", "null"],
          properties: {
            occurredAt: { type: ["string", "null"] },
            accountId: { type: ["string", "null"] },
            contactNames: { type: "array", items: { type: "string" } },
            discussed: { type: "string" },
          },
          required: ["occurredAt", "accountId", "contactNames", "discussed"],
          additionalProperties: false,
        },
        nextMeeting: {
          type: ["object", "null"],
          properties: {
            scheduledFor: { type: ["string", "null"] },
            withWhom: { type: "string" },
            purpose: { type: "string" },
          },
          required: ["scheduledFor", "withWhom", "purpose"],
          additionalProperties: false,
        },
        awaitingInternal: { type: "array", items: { type: "string" } },
        nextActions: { type: "array", items: { type: "string" } },
      },
      required: ["headline", "lastContact", "nextMeeting", "awaitingInternal", "nextActions"],
      additionalProperties: false,
    },
  },
  required: ["documentType", "signals", "unmatchedAccountMentions", "latestUpdate"],
  additionalProperties: false,
};

/** The shape Claude's tool_use.input arrives in for read_document — mirrors ClaudeReadDocumentResult field-for-field. */
interface ReadDocumentToolInput {
  documentType: string;
  signals: {
    accountId: string | null;
    title: string;
    summary: string;
    type: string;
    confidence: number;
    dateObserved: string | null;
  }[];
  unmatchedAccountMentions: string[];
  latestUpdate: {
    headline: string | null;
    lastContact: { occurredAt: string | null; accountId: string | null; contactNames: string[]; discussed: string } | null;
    nextMeeting: { scheduledFor: string | null; withWhom: string; purpose: string } | null;
    awaitingInternal: string[];
    nextActions: string[];
  } | null;
}

/**
 * PDFs and images go to Claude natively as their own content-block types;
 * everything else has already been flattened to text by the uploader. One
 * builder so the three cases can't drift apart between call sites.
 */
function documentContentBlocks(content: ClaudeDocumentContent): Anthropic.ContentBlockParam[] {
  switch (content.kind) {
    case "pdf":
      return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: content.base64Data } }];
    case "image":
      return [{ type: "image", source: { type: "base64", media_type: content.mediaType, data: content.base64Data } }];
    case "text":
      return [{ type: "text", text: content.text }];
  }
}

function debugLog(label: string, value: unknown): void {
  if (process.env.DEBUG?.includes("claude")) {
    console.debug(`[ClaudeServiceAdapter] ${label}`, value);
  }
}

function renderEvidenceReference(evidence: EvidenceReference): string {
  const parts = [`kind=${evidence.kind}`];
  if (evidence.referenceId) parts.push(`referenceId=${evidence.referenceId}`);
  if (evidence.excerpt) parts.push(`excerpt="${evidence.excerpt}"`);
  if (evidence.locator) parts.push(`locator=${evidence.locator}`);
  return `- ${parts.join(", ")}`;
}

/** Serialises a ContextBundle into structured markdown — the only form of the bundle Claude ever sees. */
function renderContextBundleAsMarkdown(bundle: ContextBundle): string {
  const lines = [
    "# Context Bundle",
    `- id: ${bundle.id}`,
    `- assembled at: ${bundle.assembledAt.toISOString()}`,
  ];
  if (bundle.subjectAccountId) {
    lines.push(`- subject account: ${bundle.subjectAccountId}`);
  }
  lines.push("", "## Evidence");
  if (bundle.evidence.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(...bundle.evidence.map(renderEvidenceReference));
  }
  return lines.join("\n");
}

function toReadDocumentResult(input: ReadDocumentToolInput): ClaudeReadDocumentResult {
  return {
    documentType: input.documentType,
    signals: input.signals.map((s) => ({
      accountId: s.accountId,
      title: s.title,
      summary: s.summary,
      type: s.type,
      confidence: s.confidence,
      dateObserved: s.dateObserved,
    })),
    unmatchedAccountMentions: input.unmatchedAccountMentions,
    latestUpdate: input.latestUpdate,
  };
}

function toRecordInsightResult(input: RecordInsightToolInput): ClaudeInsightResult {
  return {
    summary: input.summary,
    whyItMatters: input.whyItMatters,
    relatedEntities: input.relatedEntities,
    evidence: input.evidence.map((e) => ({
      kind: e.kind,
      referenceId: e.referenceId ?? undefined,
      excerpt: e.excerpt ?? undefined,
      locator: e.locator ?? undefined,
    })),
    confidence: input.confidence,
    recommendedAction: input.recommendedAction
      ? { description: input.recommendedAction.description, dueDate: input.recommendedAction.dueDate ?? undefined }
      : undefined,
  };
}

/**
 * Satisfies IClaudeService against the real Anthropic API. The prompt is
 * assembled from a versioned file on disk (never an inline string) plus the
 * ContextBundle rendered as markdown; the response is never parsed as free
 * text — a single strict, forced tool call is the only way this adapter
 * accepts output, so a malformed response fails loudly instead of producing
 * a plausible-looking but wrong Insight.
 */
export class ClaudeServiceAdapter implements IClaudeService {
  private readonly client: Anthropic;
  private readonly promptsBaseDir: string;

  constructor(apiKey: string, promptsBaseDir: string = DEFAULT_PROMPTS_BASE_DIR) {
    this.client = new Anthropic({ apiKey });
    this.promptsBaseDir = promptsBaseDir;
  }

  async generateInsight(params: { contextBundle: ContextBundle; promptProfile: PromptProfile }): Promise<ClaudeInsightResult> {
    const systemPrompt = await this.loadSystemPrompt(params.promptProfile);
    const userMessage = renderContextBundleAsMarkdown(params.contextBundle);

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [
          {
            name: TOOL_NAME,
            description: "Record the structured insight derived from the evidence in the context bundle.",
            input_schema: RECORD_INSIGHT_SCHEMA,
            strict: true,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
      });
    } catch (error) {
      throw new Error(`Claude request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME,
    );
    if (!toolUse) {
      throw new Error(`Claude did not return a ${TOOL_NAME} tool call (stop_reason: ${response.stop_reason})`);
    }

    debugLog("raw tool_use.input", toolUse.input);

    return toRecordInsightResult(toolUse.input as RecordInsightToolInput);
  }

  async readDocument(params: {
    documentContent: ClaudeDocumentContent;
    knownAccounts: { id: string; name: string }[];
  }): Promise<ClaudeReadDocumentResult> {
    const systemPrompt = await this.loadSystemPrompt({ name: "document-reading", version: "v1" });

    const knownAccountsText =
      params.knownAccounts.length > 0 ? params.knownAccounts.map((a) => `- ${a.id}: ${a.name}`).join("\n") : "(none)";
    // Today's date is stated because the model has no clock of its own, and
    // the update it drafts is full of relative dates ("last Thursday", "next
    // week") that cannot be resolved without one.
    const today = new Date().toISOString().slice(0, 10);
    const introText = `# Today\n${today}\n\n# Known Accounts\n${knownAccountsText}\n\n# Document\n`;

    const content: Anthropic.MessageParam["content"] = [
      { type: "text", text: introText },
      ...documentContentBlocks(params.documentContent),
    ];

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        thinking: { type: "adaptive" },
        system: systemPrompt,
        messages: [{ role: "user", content }],
        tools: [
          {
            name: READ_DOCUMENT_TOOL_NAME,
            description:
              "Record what this document is, every discrete signal it contains, and — only if it reports contact with a counterparty — how it revises the running Brazil expansion update.",
            input_schema: READ_DOCUMENT_SCHEMA,
            strict: true,
          },
        ],
        tool_choice: { type: "tool", name: READ_DOCUMENT_TOOL_NAME },
      });
    } catch (error) {
      throw new Error(`Claude request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === READ_DOCUMENT_TOOL_NAME,
    );
    if (!toolUse) {
      throw new Error(`Claude did not return a ${READ_DOCUMENT_TOOL_NAME} tool call (stop_reason: ${response.stop_reason})`);
    }

    debugLog("raw tool_use.input (read_document)", toolUse.input);

    return toReadDocumentResult(toolUse.input as ReadDocumentToolInput);
  }

  /** Only needs name/version to locate the file on disk — accepts the full domain PromptProfile (structurally compatible) or a plain literal. */
  private async loadSystemPrompt(profile: { name: string; version: string }): Promise<string> {
    const filePath = path.join(this.promptsBaseDir, profile.name, profile.version, "system.md");
    try {
      return await readFile(filePath, "utf-8");
    } catch (error) {
      throw new Error(
        `Prompt file not found for profile "${profile.name}" version "${profile.version}" at ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
