import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  IMarketResearchService,
  MarketResearchQuery,
  MarketResearchRecency,
  MarketResearchResult,
  MarketResearchSource,
} from "@pulse-brazil/application";

const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar";
const SYSTEM_PROMPT_PROFILE = { name: "market-research-sweep", version: "v1" };

const here = path.dirname(fileURLToPath(import.meta.url));
/** packages/infrastructure/src/adapters -> repo root/claude/prompts, whether running from src (tsx) or a future dist build (same directory depth). */
const DEFAULT_PROMPTS_BASE_DIR = path.resolve(here, "..", "..", "..", "..", "claude", "prompts");

const RECENCY_TO_SEARCH_FILTER: Record<Exclude<MarketResearchRecency, null>, string> = {
  P1D: "day",
  P7D: "week",
  P30D: "month",
  P365D: "year",
};

interface PerplexityChoice {
  message: { content: string };
}

interface PerplexityCitation {
  url: string;
  title?: string;
  snippet?: string;
}

interface PerplexityResponse {
  choices: PerplexityChoice[];
  citations?: PerplexityCitation[];
}

function debugLog(label: string, value: unknown): void {
  if (process.env.DEBUG?.includes("perplexity")) {
    console.debug(`[PerplexityMarketResearchAdapter] ${label}`, value);
  }
}

/**
 * Satisfies IMarketResearchService against the Perplexity API. Uses the
 * "sonar" model — Perplexity's web-search model — never "sonar-pro" unless
 * a future config flag enables it, per the task's explicit instruction. The
 * system prompt is loaded from a versioned file on disk, matching
 * ClaudeServiceAdapter's pattern, never an inline string.
 */
export class PerplexityMarketResearchAdapter implements IMarketResearchService {
  private readonly promptsBaseDir: string;

  constructor(
    private readonly apiKey: string,
    promptsBaseDir: string = DEFAULT_PROMPTS_BASE_DIR,
  ) {
    this.promptsBaseDir = promptsBaseDir;
  }

  async research(query: MarketResearchQuery): Promise<MarketResearchResult> {
    const systemPrompt = await this.loadSystemPrompt();

    const body: Record<string, unknown> = {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query.question },
      ],
      return_citations: true,
      return_images: false,
      max_tokens: 1024,
    };
    if (query.recency) {
      body.search_recency_filter = RECENCY_TO_SEARCH_FILTER[query.recency];
    }

    let response: Response;
    try {
      response = await fetch(PERPLEXITY_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(`Perplexity request failed for "${query.question}": ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      const bodyPreview = (await response.text()).slice(0, 200);
      throw new Error(`Perplexity request failed with status ${response.status}: ${bodyPreview}`);
    }

    const payload = (await response.json()) as PerplexityResponse;
    debugLog("raw response body", payload);

    const answer = payload.choices[0]?.message.content ?? "";
    const sources: MarketResearchSource[] = (payload.citations ?? []).map((citation) => ({
      url: citation.url,
      title: citation.title,
      snippet: citation.snippet,
    }));

    return { answer, sources, retrievedAt: new Date() };
  }

  private async loadSystemPrompt(): Promise<string> {
    const { name, version } = SYSTEM_PROMPT_PROFILE;
    const filePath = path.join(this.promptsBaseDir, name, version, "system.md");
    try {
      return await readFile(filePath, "utf-8");
    } catch (error) {
      throw new Error(
        `Prompt file not found for profile "${name}" version "${version}" at ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
