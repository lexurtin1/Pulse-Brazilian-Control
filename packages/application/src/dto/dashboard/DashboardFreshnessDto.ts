/** Per-source status. "never" is distinct from "stale" — a source that has never produced data is a different problem from one that went stale after working. */
export type SourceFreshnessStatus = "fresh" | "aging" | "stale" | "never";

/** The header ring only ever shows three colours — a "never" source still forces this to "stale" (see GetDashboardFreshness), it just isn't a fourth ring colour of its own. */
export type OverallFreshnessStatus = "fresh" | "aging" | "stale";

export interface SourceFreshnessDto {
  label: string;
  status: SourceFreshnessStatus;
  /** ISO timestamp, absent when status is "never". */
  asOf?: string;
}

export interface DashboardFreshnessDto {
  overallStatus: OverallFreshnessStatus;
  pipeline: SourceFreshnessDto;
  marketSweep: SourceFreshnessDto;
}
