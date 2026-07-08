/**
 * Where an office location sits on the path from raw address to a
 * trustworthy map pin. Geocoding produces `GeocodedPendingReview`; a human
 * either confirms it (`ManuallyVerified`) or replaces it with their own
 * coordinate (`ManuallyOverridden`).
 */
export enum LocationVerificationState {
  Unverified = "Unverified",
  GeocodedPendingReview = "GeocodedPendingReview",
  ManuallyVerified = "ManuallyVerified",
  ManuallyOverridden = "ManuallyOverridden",
}
