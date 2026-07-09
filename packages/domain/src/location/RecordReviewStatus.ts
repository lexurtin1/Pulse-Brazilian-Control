/**
 * Whether a LocationRecord needs a human to look at it — independent of
 * LocationVerificationState, which is specifically about coordinate trust.
 * A record can have a perfectly good geocoded coordinate and still need
 * review for an unrelated reason (an ambiguous account-name match, a
 * suspected duplicate, a kind that implies a link that never resolved).
 */
export enum RecordReviewStatus {
  Pending = "Pending",
  Approved = "Approved",
  ReviewRequired = "ReviewRequired",
  Rejected = "Rejected",
}
