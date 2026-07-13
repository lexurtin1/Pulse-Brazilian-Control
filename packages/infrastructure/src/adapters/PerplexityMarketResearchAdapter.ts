import type {
  IMarketResearchService,
  MarketResearchQuery,
  MarketResearchRecency,
  MarketResearchResult,
  MarketResearchSource,
} from "@pulse-brazil/application";

const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar";

const RECENCY_TO_SEARCH_FILTER: Record<Exclude<MarketResearchRecency, null>, string> = {
  P1D: "day",
  P7D: "week",
  P30D: "month",
  P365D: "year",
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    bullets: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
      description: "Up to 3 short, distinct bullet points (roughly one sentence each) covering genuinely new developments. Empty if there is nothing new since the prior findings supplied in the prompt.",
    },
    detail: {
      type: "string",
      description: "A short paragraph synthesising the bullets with a bit more context. Empty string if bullets is empty.",
    },
  },
  required: ["bullets", "detail"],
};

interface PerplexityStructuredContent {
  bullets: string[];
  detail: string;
}

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

function buildUserMessage(query: MarketResearchQuery): string {
  if (!query.priorBullets || query.priorBullets.length === 0) {
    return query.question;
  }
  const priorList = query.priorBullets.map((bullet) => `- ${bullet}`).join("\n");
  return `${query.question}\n\nHere is what was already known as of the last check:\n${priorList}\n\nOnly report developments that are genuinely new since the above. If there is nothing new, return an empty bullets array and an empty detail string.`;
}

/**
 * Satisfies IMarketResearchService against the Perplexity API. Uses the
 * "sonar" model — Perplexity's web-search model — never "sonar-pro" unless
 * a future config flag enables it, per the task's explicit instruction.
 * Forces structured JSON output (response_format: json_schema) so callers
 * always get a small, fixed-shape set of bullets rather than free prose.
 */
export class PerplexityMarketResearchAdapter implements IMarketResearchService {
  constructor(private readonly apiKey: string) {}

  async research(query: MarketResearchQuery): Promise<MarketResearchResult> {
    const body: Record<string, unknown> = {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a market intelligence analyst tracking the Brazilian fund distribution and asset servicing market on behalf of Calastone, a cross-border fund order-routing and settlement network. Answer factually and concisely, grounded only in real web search results. Respond with the exact JSON shape requested — no markdown, no prose outside the JSON.",
        },
        { role: "user", content: buildUserMessage(query) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { schema: RESPONSE_SCHEMA },
      },
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

    const rawContent = payload.choices[0]?.message.content ?? "{}";
    let structured: PerplexityStructuredContent;
    try {
      structured = JSON.parse(rawContent) as PerplexityStructuredContent;
    } catch (error) {
      throw new Error(`Perplexity returned non-JSON content for "${query.question}": ${error instanceof Error ? error.message : String(error)}`);
    }

    const sources: MarketResearchSource[] = (payload.citations ?? []).map((citation) => ({
      url: citation.url,
      title: citation.title,
      snippet: citation.snippet,
    }));

    return {
      bullets: structured.bullets ?? [],
      detail: structured.detail ?? "",
      sources,
      retrievedAt: new Date(),
    };
  }
}
