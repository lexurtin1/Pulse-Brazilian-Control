export interface AccountLocationSummaryDto {
  city?: string;
  country: string;
}

/**
 * The at-a-glance projection of an Account for list views. `primaryLocation`
 * comes from the account's GeographicScope (its home market), not from an
 * OfficeLocation address — those are a detail-view concern.
 */
export interface AccountSummaryDto {
  id: string;
  name: string;
  type: string;
  status: string;
  temperatureBand?: string;
  clientTypes: string[];
  primaryLocation: AccountLocationSummaryDto;
  latestAssessmentDate?: string;
}
