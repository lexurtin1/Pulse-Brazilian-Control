/**
 * What kind of source material a document is. Used for both the type the
 * uploader declares and the type Claude later infers, so the two can be
 * compared and any mismatch surfaced rather than silently overridden.
 */
export enum DocumentType {
  CallNoteDocument = "CallNoteDocument",
  MeetingMinutes = "MeetingMinutes",
  RegulatoryFiling = "RegulatoryFiling",
  NewsArticle = "NewsArticle",
  PitchDeck = "PitchDeck",
  ContractOrAgreement = "ContractOrAgreement",
  ResearchReport = "ResearchReport",
  EmailThread = "EmailThread",
  LocationDataset = "LocationDataset",
  Other = "Other",
}
