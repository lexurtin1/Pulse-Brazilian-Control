export interface LocationRecordRawAddressDto {
  addressLine?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface LocationRecordCoordinateDto {
  latitude: number;
  longitude: number;
}

/** The full reviewable shape — raw vs normalized address, both coordinate candidates, and full provenance/traceability. */
export interface LocationRecordDto {
  id: string;
  kind: string;
  label: string;
  rawAddress: LocationRecordRawAddressDto;
  normalizedAddress?: string;
  unverifiedCoordinate?: LocationRecordCoordinateDto;
  verifiedCoordinate?: LocationRecordCoordinateDto;
  verificationState: string;
  reviewStatus: string;
  linkedAccountId?: string;
  linkedSignalId?: string;
  eventDate?: string;
  isPrimary: boolean;
  countryCode: string;
  sourceDocumentId: string;
  sourceRowNumber: number;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}
