export interface CompanyResearchQuery {
  accountName: string;
}

/**
 * The plain, structured shape a company-research call returns — mirrors
 * MarketResearchResult's role as the boundary where an external system's
 * output first lands, but a distinct shape: two fact-only sections instead
 * of a headline/bullets/detail news item, and no sources (Information Sweep
 * deliberately doesn't surface citations). RunAccountResearchSweep converts
 * this into a domain AccountResearchBrief.
 */
export interface CompanyResearchResult {
  history: string[];
  competitiveIntel: string[];
  retrievedAt: Date;
}

/**
 * The one port through which the application layer asks for a factual,
 * no-opinion research brief on a single company. Named researchCompany
 * (not research) so a single adapter class can implement both this and
 * IMarketResearchService without a method-name collision.
 */
export interface ICompanyResearchService {
  researchCompany(query: CompanyResearchQuery): Promise<CompanyResearchResult>;
}
