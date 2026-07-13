export interface SignalGeographicScopeDto {
  countryCode: string;
  region?: string;
  city?: string;
}

export interface SignalSourceDto {
  url: string;
}

/**
 * Serialisable projection of a Signal. `detail` and `sources` are derived
 * from evidence (first excerpt found, and every distinct locator URL) so the
 * live feed can expand a card in place without a second round trip — deemed
 * worth the slightly bigger payload since the feed's volume is small.
 */
export interface SignalDto {
  id: string;
  source: string;
  type: string;
  title: string;
  summary: string;
  detail?: string;
  sources: SignalSourceDto[];
  linkedAccountIds: string[];
  linkedThemeIds: string[];
  geographicScope?: SignalGeographicScopeDto;
  dateObserved: string;
  confidenceScore: number;
  origin: string;
  evidenceCount: number;
}
