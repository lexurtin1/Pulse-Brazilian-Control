export interface SignalGeographicScopeDto {
  countryCode: string;
  region?: string;
  city?: string;
}

/** Serialisable projection of a Signal. Evidence is summarized as a count — full evidence detail belongs to a dedicated evidence view, not this list-shaped DTO. */
export interface SignalDto {
  id: string;
  source: string;
  type: string;
  title: string;
  summary: string;
  linkedAccountIds: string[];
  linkedThemeIds: string[];
  geographicScope?: SignalGeographicScopeDto;
  dateObserved: string;
  confidenceScore: number;
  origin: string;
  evidenceCount: number;
}
