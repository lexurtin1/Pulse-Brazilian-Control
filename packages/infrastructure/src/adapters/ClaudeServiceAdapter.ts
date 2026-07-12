import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeDocumentContent, ClaudeExtractSignalsResult, ClaudeInsightResult, IClaudeService } from "@pulse-brazil/application";
import type { ContextBundle, EvidenceReference, PromptProfile } from "@pulse-brazil/domain";

const MODEL = "claude-sonnet-5";
const TOOL_NAME = "record_insight";
const EXTRACT_SIGNALS_TOOL_NAME = "extract_signals";

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

const EXTRACT_SIGNALS_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
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
  },
  required: ["signals", "unmatchedAccountMentions"],
  additionalProperties: false,
};

/** The shape Claude's tool_use.input arrives in for extract_signals — mirrors ClaudeExtractSignalsResult field-for-field. */
interface ExtractSignalsToolInput {
  signals: {
    accountId: string | null;
    title: string;
    summary: string;
    type: string;
    confidence: number;
    dateObserved: string | null;
  }[];
  unmatchedAccountMentions: string[];
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

function toExtractSignalsResult(input: ExtractSignalsToolInput): ClaudeExtractSignalsResult {
  return {
    signals: input.signals.map((s) => ({
      accountId: s.accountId,
      title: s.title,
      summary: s.summary,
      type: s.type,
      confidence: s.confidence,
      dateObserved: s.dateObserved,
    })),
    unmatchedAccountMentions: input.unmatchedAccountMentions,
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

  async extractSignalsFromDocument(params: {
    documentContent: ClaudeDocumentContent;
    knownAccounts: { id: string; name: string }[];
  }): Promise<ClaudeExtractSignalsResult> {
    const systemPrompt = await this.loadSystemPrompt({ name: "document-signal-extraction", version: "v1" });

    const knownAccountsText =
      params.knownAccounts.length > 0 ? params.knownAccounts.map((a) => `- ${a.id}: ${a.name}`).join("\n") : "(none)";
    const introText = `# Known Accounts\n${knownAccountsText}\n\n# Document\n`;

    const content: Anthropic.MessageParam["content"] =
      params.documentContent.kind === "pdf"
        ? [
            { type: "text", text: introText },
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: params.documentContent.base64Data },
            },
          ]
        : [{ type: "text", text: introText + params.documentContent.text }];

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        system: systemPrompt,
        messages: [{ role: "user", content }],
        tools: [
          {
            name: EXTRACT_SIGNALS_TOOL_NAME,
            description:
              "Record every discrete signal extracted from the document, each attributed to a known account if clearly identifiable.",
            input_schema: EXTRACT_SIGNALS_SCHEMA,
            strict: true,
          },
        ],
        tool_choice: { type: "tool", name: EXTRACT_SIGNALS_TOOL_NAME },
      });
    } catch (error) {
      throw new Error(`Claude request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === EXTRACT_SIGNALS_TOOL_NAME,
    );
    if (!toolUse) {
      throw new Error(`Claude did not return a ${EXTRACT_SIGNALS_TOOL_NAME} tool call (stop_reason: ${response.stop_reason})`);
    }

    debugLog("raw tool_use.input (extract_signals)", toolUse.input);

    return toExtractSignalsResult(toolUse.input as ExtractSignalsToolInput);
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
