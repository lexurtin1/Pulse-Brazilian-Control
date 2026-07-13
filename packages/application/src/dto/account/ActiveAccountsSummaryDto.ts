/** Absent entirely when there is no previous snapshot to compare against — a fabricated "vs. 0" delta would be misleading. */
export interface ActiveAccountsSummaryDeltaDto {
  count: number;
  previousAsOf: string;
}

export interface ActiveAccountsSummaryDto {
  count: number;
  asOf: string;
  delta?: ActiveAccountsSummaryDeltaDto;
}
