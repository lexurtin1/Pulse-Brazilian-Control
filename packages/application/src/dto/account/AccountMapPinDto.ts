export interface AccountMapPinCoordinateDto {
  latitude: number;
  longitude: number;
}

/** A lean, map-purpose-built projection — presentation renders this as a pin, never reaching into the full Account. */
export interface AccountMapPinDto {
  id: string;
  name: string;
  temperatureBand?: string;
  coordinate: AccountMapPinCoordinateDto;
  verificationState: string;
}
