export interface SalesforceAccountCsvRowErrorDto {
  rowNumber: number;
  errors: string[];
}

export interface ReconcileSalesforceAccountsResultDto {
  totalRows: number;
  matchedCount: number;
  /** Account names in the CSV that didn't match any existing Account by name — never fabricated, surfaced for manual review. */
  unmatchedAccountNames: string[];
  rejectedRows: SalesforceAccountCsvRowErrorDto[];
  updatedAccountIds: string[];
}
