import { AccountStatus, ClientType } from "@pulse-brazil/domain";

/**
 * Deterministic CSV row validation, kept entirely outside the domain model
 * — see PipelineCsvRowValidator's doc comment for the same rule. Column
 * names are the real "Brazil_Accounts_Enriched" export headers verbatim,
 * confirmed 2026-07-13 against the actual file (mirrors the enrichment of
 * a raw Salesforce "All Brazil Accounts" report — reconciled field-by-field
 * against that raw export with zero conflicts, see claude/INTEGRATION_PLAN.md).
 */
export interface SalesforceAccountDraft {
  rowNumber: number;
  accountName: string;
  clientTypes: ClientType[];
  /** Client Type segments that didn't match a known ClientType — surfaced, never silently dropped. */
  unrecognizedClientTypeSegments: string[];
  accountOwner?: string;
  createdCohortYear?: string;
  status: AccountStatus;
  openOpportunityCount?: number;
  sourceReference?: string;
  rawAddress: {
    addressLine?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  latitude?: number;
  longitude?: number;
  enrichmentConfidence?: string;
}

export interface SalesforceAccountCsvRowError {
  rowNumber: number;
  errors: string[];
}

export interface SalesforceAccountCsvValidationResult {
  valid: SalesforceAccountDraft[];
  invalid: SalesforceAccountCsvRowError[];
}

export const REQUIRED_SALESFORCE_ACCOUNT_CSV_COLUMNS = ["Account Name", "Status"] as const;

export function validateSalesforceAccountCsvHeaders(headers: string[]): string[] {
  const present = new Set(headers.map((header) => header.toLowerCase()));
  return REQUIRED_SALESFORCE_ACCOUNT_CSV_COLUMNS.filter((column) => !present.has(column.toLowerCase()));
}

/**
 * Real Salesforce "Status" values, mapped onto the existing AccountStatus
 * vocabulary — a judgment call (grilled 2026-07-13), not a verified 1:1
 * mapping: "Disabled" is treated as Dormant (paused, not necessarily lost)
 * rather than Churned, and "In Discussions" as Prospect (still being
 * pursued, not yet won).
 */
const STATUS_LABELS: Record<string, AccountStatus> = {
  live: AccountStatus.Active,
  prospect: AccountStatus.Prospect,
  "in discussions": AccountStatus.Prospect,
  disabled: AccountStatus.Dormant,
};

/** Real Salesforce "Client Type" segment labels — human strings, not the enum's PascalCase keys. */
const CLIENT_TYPE_LABELS: Record<string, ClientType> = {
  distributor: ClientType.Distributor,
  "fund manager": ClientType.FundManager,
  bank: ClientType.Bank,
  "third-party administrator": ClientType.ThirdPartyAdministrator,
  "software vendor": ClientType.SoftwareVendor,
  "fund of fund dealing desk": ClientType.FundOfFundDealingDesk,
  "fund accountant": ClientType.FundAccountant,
};

/** "Bank; Distributor; Fund Manager" -> multiple ClientType values — a single account can genuinely hold several roles at once. */
function parseClientTypes(raw: string | undefined): { clientTypes: ClientType[]; unrecognized: string[] } {
  const segments = (raw ?? "").split(";").map((segment) => segment.trim()).filter(Boolean);
  const clientTypes: ClientType[] = [];
  const unrecognized: string[] = [];
  for (const segment of segments) {
    const match = CLIENT_TYPE_LABELS[segment.toLowerCase()];
    if (match) clientTypes.push(match);
    else unrecognized.push(segment);
  }
  return { clientTypes, unrecognized };
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw || !raw.trim()) return undefined;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : undefined;
}

export function validateSalesforceAccountCsvRow(row: Record<string, string>, rowNumber: number): SalesforceAccountDraft | SalesforceAccountCsvRowError {
  const errors: string[] = [];

  const accountName = (row["Account Name"] ?? "").trim();
  if (!accountName) {
    errors.push("Account Name must not be empty");
  }

  const statusRaw = row["Status"] ?? "";
  const status = STATUS_LABELS[statusRaw.trim().toLowerCase()];
  if (!status) {
    errors.push(`Status "${statusRaw}" is not a recognized value (expected one of: ${Object.keys(STATUS_LABELS).join(", ")})`);
  }

  if (errors.length > 0) {
    return { rowNumber, errors };
  }

  const { clientTypes, unrecognized } = parseClientTypes(row["Client Type"]);

  return {
    rowNumber,
    accountName,
    clientTypes,
    unrecognizedClientTypeSegments: unrecognized,
    accountOwner: row["Account Owner"]?.trim() || undefined,
    createdCohortYear: row["Created (CY)"]?.trim() || undefined,
    status: status as AccountStatus,
    openOpportunityCount: parseNumber(row["# Open Opps"]),
    sourceReference: row["Source Reference"]?.trim() || undefined,
    rawAddress: {
      addressLine: row["Street Address"]?.trim() || undefined,
      city: row["City"]?.trim() || undefined,
      state: row["State"]?.trim() || undefined,
      postalCode: row["Postcode"]?.trim() || undefined,
      country: row["Country"]?.trim() || undefined,
    },
    latitude: parseNumber(row["Latitude"]),
    longitude: parseNumber(row["Longitude"]),
    enrichmentConfidence: row["Enrichment Confidence"]?.trim() || undefined,
  };
}

export function validateSalesforceAccountCsvRows(rows: Record<string, string>[]): SalesforceAccountCsvValidationResult {
  const valid: SalesforceAccountDraft[] = [];
  const invalid: SalesforceAccountCsvRowError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for 1-indexing, +1 for the header row
    const result = validateSalesforceAccountCsvRow(row, rowNumber);
    if ("errors" in result) {
      invalid.push(result);
      return;
    }
    valid.push(result);
  });

  return { valid, invalid };
}
