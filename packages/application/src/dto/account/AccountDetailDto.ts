import type { InsightDto } from "../insight/InsightDto.js";
import type { SignalDto } from "../signal/SignalDto.js";
import type { AccountSummaryDto } from "./AccountSummaryDto.js";

export interface OfficeLocationCoordinateDto {
  latitude: number;
  longitude: number;
}

export interface OfficeLocationDto {
  id: string;
  rawAddress: string;
  normalizedAddress?: string;
  coordinate?: OfficeLocationCoordinateDto;
  verificationState: string;
  isPrimary: boolean;
}

export interface ExternalReferenceDto {
  system: string;
  externalId: string;
  url?: string;
}

/** The full account view. Extends the summary with everything a dossier needs: offices, external identifiers, theme linkage, recent signals, and the latest insight. */
export interface AccountDetailDto extends AccountSummaryDto {
  officeLocations: OfficeLocationDto[];
  externalReferences: ExternalReferenceDto[];
  linkedThemeIds: string[];
  recentSignals: SignalDto[];
  latestInsight?: InsightDto;
}
