/**
 * What the map reads — every map-eligible LocationRecord regardless of
 * kind, so the frontend renders one pin layer instead of one per business
 * concept. Carries verificationState/reviewStatus explicitly so the
 * frontend can render trust-state distinctly without inventing its own
 * judgment about what's "real" — that judgment is made here, once.
 */
export interface LocationRecordMapPinCoordinateDto {
  latitude: number;
  longitude: number;
}

export interface LocationRecordMapPinDto {
  id: string;
  kind: string;
  label: string;
  coordinate: LocationRecordMapPinCoordinateDto;
  verificationState: string;
  reviewStatus: string;
  linkedAccountId?: string;
  linkedAccountName?: string;
  eventDate?: string;
}
