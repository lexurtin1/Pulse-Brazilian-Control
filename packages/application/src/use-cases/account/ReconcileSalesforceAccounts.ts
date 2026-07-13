import {
  asOfficeLocationId,
  Coordinate,
  ExternalReference,
  ExternalSystem,
  OfficeLocation,
  RawAddressInput,
} from "@pulse-brazil/domain";
import type { ReconcileSalesforceAccountsResultDto, SalesforceAccountCsvRowErrorDto } from "../../dto/account/ReconcileSalesforceAccountsResultDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import { parseCsv } from "../../validation/parseCsv.js";
import { validateSalesforceAccountCsvHeaders, validateSalesforceAccountCsvRows } from "../../validation/SalesforceAccountCsvRowValidator.js";

export interface ReconcileSalesforceAccountsCommand {
  csvText: string;
}

/**
 * Enriches existing Accounts with real Salesforce account-export metadata
 * (client types, owner, cohort year, open-opportunity count, status,
 * Salesforce external reference, and an address/coordinate only when the
 * account has none yet). This is a reconciliation of already-known
 * accounts, not an ingestion pipeline — it never creates a new Account:
 * a CSV row with no matching existing Account (by exact name, case
 * insensitive) is surfaced as unmatched, never fabricated. Existing office
 * locations are never overwritten — an account that already has one keeps
 * it untouched, so this can't clobber verified location work from a prior
 * import.
 */
export class ReconcileSalesforceAccounts {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: ReconcileSalesforceAccountsCommand): Promise<ReconcileSalesforceAccountsResultDto> {
    if (!command.csvText.trim()) {
      throw new ValidationError("csvText must not be empty");
    }

    const { headers, rows } = parseCsv(command.csvText);
    const missingHeaders = validateSalesforceAccountCsvHeaders(headers);
    if (missingHeaders.length > 0) {
      throw new ValidationError(`CSV is missing required column(s): ${missingHeaders.join(", ")}`);
    }

    const { valid, invalid } = validateSalesforceAccountCsvRows(rows);
    const rejectedRows: SalesforceAccountCsvRowErrorDto[] = [...invalid];

    const allAccounts = await this.accounts.findAll();
    const byName = new Map(allAccounts.map((account) => [account.name.trim().toLowerCase(), account]));

    const unmatchedAccountNames: string[] = [];
    const updatedAccountIds: string[] = [];

    for (const draft of valid) {
      const key = draft.accountName.toLowerCase();
      const existing = byName.get(key);
      if (!existing) {
        unmatchedAccountNames.push(draft.accountName);
        continue;
      }

      let updated = existing
        .withSalesforceProfile({
          clientTypes: draft.clientTypes,
          accountOwner: draft.accountOwner,
          createdCohortYear: draft.createdCohortYear,
          openOpportunityCount: draft.openOpportunityCount,
        })
        .withStatus(draft.status);

      if (draft.sourceReference) {
        const otherReferences = updated.externalReferences.filter((ref) => ref.system !== ExternalSystem.Salesforce);
        updated = updated.withExternalReferences([
          ...otherReferences,
          ExternalReference.of({ system: ExternalSystem.Salesforce, externalId: draft.sourceReference }),
        ]);
      }

      if (updated.officeLocations.length === 0 && draft.latitude !== undefined && draft.longitude !== undefined) {
        const rawAddress = RawAddressInput.of(draft.rawAddress);
        let office = OfficeLocation.fromRawAddress({
          id: asOfficeLocationId(this.idGenerator.newId()),
          rawAddress: rawAddress.toSingleLine(),
          isPrimary: true,
        });
        const coordinate = Coordinate.of(draft.latitude, draft.longitude);
        // "High"/"Medium" enrichment confidence means this was already
        // Google-Places-verified upstream — trust it as verified rather
        // than re-queuing it for review. "Low" stays pending.
        office = draft.enrichmentConfidence === "High" || draft.enrichmentConfidence === "Medium"
          ? office.verify(coordinate)
          : office.withGeocodedCoordinate(coordinate);
        updated = updated.withOfficeLocations([office]);
      }

      await this.accounts.save(updated);
      updatedAccountIds.push(updated.id);
      byName.set(key, updated);
    }

    return {
      totalRows: rows.length,
      matchedCount: updatedAccountIds.length,
      unmatchedAccountNames,
      rejectedRows,
      updatedAccountIds,
    };
  }
}
