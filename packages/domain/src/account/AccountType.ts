/**
 * The commercial role an account plays in Brazilian capital markets.
 * Kept small and specific to what Pulse Brazil actually covers; extend
 * once real Salesforce segmentation data is on hand.
 */
export enum AccountType {
  AssetManager = "AssetManager",
  Bank = "Bank",
  Broker = "Broker",
  Custodian = "Custodian",
  ExchangeOrVenue = "ExchangeOrVenue",
  RegulatoryBody = "RegulatoryBody",
  Corporate = "Corporate",
  Other = "Other",
}
