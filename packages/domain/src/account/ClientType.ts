/**
 * Real Salesforce "Client Type" categorization — shown/stored verbatim,
 * multi-valued because a single account can genuinely hold several roles at
 * once (e.g. "Bank; Distributor; Fund Accountant"). Distinct from
 * `AccountType`, which is Pulse's own broader commercial-role classification
 * on a different axis; kept separate rather than replacing it, since
 * existing accounts already carry AccountType values this vocabulary
 * doesn't cover, and collapsing a multi-valued reality onto a single-valued
 * field would lose information.
 */
export enum ClientType {
  Distributor = "Distributor",
  FundManager = "FundManager",
  Bank = "Bank",
  ThirdPartyAdministrator = "ThirdPartyAdministrator",
  SoftwareVendor = "SoftwareVendor",
  FundOfFundDealingDesk = "FundOfFundDealingDesk",
  FundAccountant = "FundAccountant",
}
