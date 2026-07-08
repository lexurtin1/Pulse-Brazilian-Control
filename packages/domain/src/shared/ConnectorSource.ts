/**
 * Where a piece of ingested material entered the system. A reference
 * vocabulary only — the domain does not know how any of these connectors
 * work; that belongs to infrastructure.
 */
export enum ConnectorSource {
  ManualEntry = "ManualEntry",
  SalesforceSync = "SalesforceSync",
  EmailForward = "EmailForward",
  NewsFeed = "NewsFeed",
  RegulatoryFeed = "RegulatoryFeed",
  DocumentUpload = "DocumentUpload",
  WebResearch = "WebResearch",
  Other = "Other",
}
