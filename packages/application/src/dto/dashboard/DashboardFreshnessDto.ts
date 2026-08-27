/** Per-source status. "never" is distinct from "stale" — a source that has never produced data is a different problem from one that went stale after working. */
export type SourceFreshnessStatus = "fresh" | "aging" | "stale" | "never";

/** The header ring only ever shows three colours — "never" is a per-source status, not a fourth ring colour. */
export type OverallFreshnessStatus = "fresh" | "aging" | "stale";

export interface SourceFreshnessDto {
  label: string;
  status: SourceFreshnessStatus;
  /** ISO timestamp, absent when status is "never". */
  asOf?: string;
}

export interface DashboardFreshnessDto {
  /** Best-of every source below, not worst-of — see GetDashboardFreshness for why. */
  overallStatus: OverallFreshnessStatus;
  pipeline: SourceFreshnessDto;
  marketSweep: SourceFreshnessDto;
  /** Any uploaded document, whatever its type — call notes, meeting minutes, decks. */
  documents: SourceFreshnessDto;
}
