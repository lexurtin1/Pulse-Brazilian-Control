/**
 * Shared ClientType -> display treatment, used everywhere an account's
 * client type needs a color mark: map pins, the map legend, and the small
 * identity dots on Top Open Deals / Live Feed / the Account Dossier header.
 * One source of truth so the same client type is always the same color.
 */

export const CLIENT_TYPE_ORDER = [
  "Distributor",
  "FundManager",
  "Bank",
  "ThirdPartyAdministrator",
  "SoftwareVendor",
  "FundOfFundDealingDesk",
  "FundAccountant",
] as const;

const CLIENT_TYPE_COLOR_VAR: Record<string, string> = {
  Distributor: "--color-client-distributor",
  FundManager: "--color-client-fundmanager",
  Bank: "--color-client-bank",
  ThirdPartyAdministrator: "--color-client-tpa",
  SoftwareVendor: "--color-client-softwarevendor",
  FundOfFundDealingDesk: "--color-client-fundoffunddesk",
  FundAccountant: "--color-client-fundaccountant",
};

const UNCLASSIFIED_COLOR_VAR = "--color-text-faint";

/** Short labels for tight spaces (legend, dots) — the full enum names run long. */
const CLIENT_TYPE_SHORT_LABEL: Record<string, string> = {
  Distributor: "Distributor",
  FundManager: "Fund Manager",
  Bank: "Bank",
  ThirdPartyAdministrator: "TPA",
  SoftwareVendor: "Software Vendor",
  FundOfFundDealingDesk: "Fund-of-Fund Desk",
  FundAccountant: "Fund Accountant",
};

/** An account can hold several ClientTypes at once (real Salesforce data) — the first entry is the color-coding primary. */
export function primaryClientType(clientTypes: readonly string[] | undefined): string | undefined {
  return clientTypes?.[0];
}

export function clientTypeColorVar(clientType: string | undefined): string {
  if (!clientType) return UNCLASSIFIED_COLOR_VAR;
  return CLIENT_TYPE_COLOR_VAR[clientType] ?? UNCLASSIFIED_COLOR_VAR;
}

export function clientTypeLabel(clientType: string | undefined): string {
  if (!clientType) return "Unclassified";
  return CLIENT_TYPE_SHORT_LABEL[clientType] ?? clientType;
}
