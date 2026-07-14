export interface AccountMapPinCoordinateDto {
  latitude: number;
  longitude: number;
}

/** A lean, map-purpose-built projection — presentation renders this as a pin, never reaching into the full Account. */
export interface AccountMapPinDto {
  id: string;
  name: string;
  temperatureBand?: string;
  clientTypes: string[];
  coordinate: AccountMapPinCoordinateDto;
  verificationState: string;
  /** Sum of `amount` across this account's open-stage deals (Discovery/Prospect/Qualified/Signed) from the latest Pipeline CSV upload. 0 if none. */
  openPipelineValue: number;
}
