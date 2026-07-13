/**
 * Whether a Deal needs a human to look at it — independent of `stage`.
 * Mirrors `location/RecordReviewStatus` in shape, kept as its own type
 * rather than shared: this codebase's convention is that each importer
 * owns its full review vocabulary rather than reaching into another
 * bounded context's (see `ImportLocationCsv`'s inlined account-matching,
 * not a shared helper).
 */
export enum DealReviewStatus {
  Pending = "Pending",
  Approved = "Approved",
  ReviewRequired = "ReviewRequired",
  Rejected = "Rejected",
}
