import type {
  CompanyResearchQuery,
  CompanyResearchResult,
  ICompanyResearchService,
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
    headline: {
      type: "string",
      description:
        "A short, specific, attention-grabbing headline (max ~10 words) for the single most newsworthy item in the bullets — name the company or body and what it actually did, e.g. 'Itau pilots tokenised fund shares' or 'CVM proposes cross-border distribution rules', not a generic restatement of the topic being researched (never something like 'ETF market' or 'Tokenisation update'). Always in English. Empty string if bullets is empty.",
    },
    bullets: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
      description:
        "Up to 3 short, distinct bullet points covering genuinely new developments, each no more than about 15 words. Always in English, even when the source material is in Portuguese or another language. Write for a salesperson skimming a feed, not an analyst: plain everyday English, no jargon, acronyms, or ticker/statute-style references without a one-word explanation of why it matters. State the headline fact plainly (who did what), not the mechanism behind it. Empty if there is nothing new since the prior findings supplied in the prompt.",
    },
    detail: {
      type: "string",
      description:
        "2-3 plain-English sentences (always in English, even when the source material is in Portuguese or another language) giving a bit more context behind the bullets, still written for a business reader with no domain jargon. Empty string if bullets is empty.",
    },
  },
  required: ["headline", "bullets", "detail"],
};

interface PerplexityStructuredContent {
  headline: string;
  bullets: string[];
  detail: string;
}

const COMPANY_BRIEF_BULLET_MAX_ITEMS = 3;
const COMPANY_BRIEF_BULLET_MAX_WORDS = 20;

const COMPANY_BRIEF_OVERVIEW_MAX_WORDS = 30;

const COMPANY_BRIEF_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    overview: {
      type: "string",
      description:
        `One short, plain-English sentence (no more than about ${COMPANY_BRIEF_OVERVIEW_MAX_WORDS} words) stating what this company is — e.g. its type of business and where it operates. No opinions, no speculation, no commentary. Empty string if nothing genuine is found — never a sentence saying information wasn't found or is unavailable.`,
    },
    history: {
      type: "array",
      items: { type: "string" },
      maxItems: COMPANY_BRIEF_BULLET_MAX_ITEMS,
      description:
        `Up to ${COMPANY_BRIEF_BULLET_MAX_ITEMS} short, distinct bullet points about the company's history, each no more than about ${COMPANY_BRIEF_BULLET_MAX_WORDS} words: founding year, founders or parent company, ownership structure (independent, subsidiary, PE-owned, listed, etc.), and key milestones such as mergers, acquisitions, or major launches. Pick only the most important facts if there are more than ${COMPANY_BRIEF_BULLET_MAX_ITEMS} candidates — do not write a long list. No opinions, no speculation, no commentary — state each fact plainly, nothing else. Always in English, even when source material is in Portuguese or another language. If nothing genuine is found, return an empty array — never a bullet saying information wasn't found, is unavailable, or couldn't be verified.`,
    },
    competitiveIntel: {
      type: "array",
      items: { type: "string" },
      maxItems: COMPANY_BRIEF_BULLET_MAX_ITEMS,
      description:
        `Up to ${COMPANY_BRIEF_BULLET_MAX_ITEMS} short, distinct bullet points of competitive intelligence relevant to Calastone, a cross-border fund order-routing and settlement network, each no more than about ${COMPANY_BRIEF_BULLET_MAX_WORDS} words: the company's current transfer agency or fund order-routing provider(s) if publicly known, custodian(s) or administrator(s), platforms or distributors it connects to, recent fund launches or market expansion, and any funds-infrastructure technology partnerships. Pick only the most important facts if there are more than ${COMPANY_BRIEF_BULLET_MAX_ITEMS} candidates — do not write a long list. No opinions, no speculation, no commentary — state each fact plainly, nothing else. Always in English, even when source material is in Portuguese or another language. If nothing genuine is found, return an empty array — never a bullet saying information wasn't found, is unavailable, or couldn't be verified.`,
    },
  },
  required: ["overview", "history", "competitiveIntel"],
};

/**
 * Belt-and-braces against sonar not reliably honoring the schema's "return
 * an empty array/string, never a placeholder" instruction — strips any
 * bullet or sentence that reads as a "nothing found" statement rather than
 * an actual fact, and caps the list length client-side in case maxItems
 * wasn't respected either.
 */
const NOT_FOUND_PATTERN = /\b(no (specific |publicly available |publicly )?information|not (publicly )?(available|disclosed|known|found)|could not (find|verify|locate)|unable to (find|verify|locate)|no (details|data|records) (were |are )?(found|available)|nothing (specific |genuine )?(was |is )?found)\b/i;

function sanitizeCompanyBriefBullets(bullets: string[]): string[] {
  return bullets
    .map((bullet) => bullet.trim())
    .filter((bullet) => bullet.length > 0 && !NOT_FOUND_PATTERN.test(bullet))
    .slice(0, COMPANY_BRIEF_BULLET_MAX_ITEMS);
}

function sanitizeCompanyBriefOverview(overview: string): string {
  const trimmed = overview.trim();
  return trimmed.length > 0 && !NOT_FOUND_PATTERN.test(trimmed) ? trimmed : "";
}

interface CompanyBriefStructuredContent {
  overview: string;
  history: string[];
  competitiveIntel: string[];
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
export class PerplexityMarketResearchAdapter implements IMarketResearchService, ICompanyResearchService {
  constructor(private readonly apiKey: string) {}

  async research(query: MarketResearchQuery): Promise<MarketResearchResult> {
    const body: Record<string, unknown> = {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are writing a market news feed for a Calastone salesperson who covers Brazil, not for a fellow analyst. Calastone is a cross-border fund order-routing and settlement network. Ground everything in real web search results — including Brazilian Portuguese-language sources — but always write the bullets and detail in English, translating and summarizing rather than quoting the source language. Use short, plain-English, non-technical language — imagine explaining it out loud to a colleague, not writing a research note. Avoid financial jargon, regulatory citation numbers, and acronyms unless you also say in plain terms why it matters. Respond with the exact JSON shape requested — no markdown, no prose outside the JSON.",
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
      headline: structured.headline ?? "",
      bullets: structured.bullets ?? [],
      detail: structured.detail ?? "",
      sources,
      retrievedAt: new Date(),
    };
  }

  /**
   * The "Information Sweep" call for a single account. Deliberately
   * unrestricted (no search_recency_filter) — company history and current
   * competitive relationships aren't "what changed this week" questions, and
   * an artificial recency window would hide older-but-still-true facts.
   * Citations aren't requested or parsed: this feature shows no sources at
   * all, per the operator's explicit request.
   */
  async researchCompany(query: CompanyResearchQuery): Promise<CompanyResearchResult> {
    const body: Record<string, unknown> = {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            `You are compiling a short, scannable company research brief for an employee of Calastone, a cross-border fund order-routing and settlement network, who is looking at this company on a map of accounts and wants an objective overview before a call — not a research report. Ground everything in real web search results — including Brazilian Portuguese-language sources — but always write in English, translating and summarizing rather than quoting the source language. Write for someone skimming, not an analyst: the overview is one short sentence (no more than about ${COMPANY_BRIEF_OVERVIEW_MAX_WORDS} words) stating what the company is, and each bullet is one short, plain-English sentence stating a single fact, no more than about ${COMPANY_BRIEF_BULLET_MAX_WORDS} words. Never dump raw search results, long paragraphs, or more than ${COMPANY_BRIEF_BULLET_MAX_ITEMS} bullets per section — if there is more material than that, select only the most important facts. State facts plainly and neutrally: no opinions, no speculation, no editorializing, no sales framing. If you cannot find genuine information for the overview or a section, return an empty string or empty array for it — do not write a sentence or bullet saying information wasn't found, is unavailable, or couldn't be verified; emptiness communicates that on its own. Respond with the exact JSON shape requested — no markdown, no prose outside the JSON.`,
        },
        { role: "user", content: `Company name: ${query.accountName}. Compile a one-sentence overview plus a factual history and competitive-intelligence brief on this company.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { schema: COMPANY_BRIEF_RESPONSE_SCHEMA },
      },
      return_citations: false,
      return_images: false,
      max_tokens: 1536,
    };

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
      throw new Error(`Perplexity request failed for company brief "${query.accountName}": ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      const bodyPreview = (await response.text()).slice(0, 200);
      throw new Error(`Perplexity request failed with status ${response.status}: ${bodyPreview}`);
    }

    const payload = (await response.json()) as PerplexityResponse;
    debugLog("raw company brief response body", payload);

    const rawContent = payload.choices[0]?.message.content ?? "{}";
    let structured: CompanyBriefStructuredContent;
    try {
      structured = JSON.parse(rawContent) as CompanyBriefStructuredContent;
    } catch (error) {
      throw new Error(`Perplexity returned non-JSON content for company brief "${query.accountName}": ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      overview: sanitizeCompanyBriefOverview(structured.overview ?? ""),
      history: sanitizeCompanyBriefBullets(structured.history ?? []),
      competitiveIntel: sanitizeCompanyBriefBullets(structured.competitiveIntel ?? []),
      retrievedAt: new Date(),
    };
  }
}
