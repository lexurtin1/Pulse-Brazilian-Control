import {
  asAccountId,
  asDocumentId,
  asLocationRecordId,
  asSignalId,
  ConnectorSource,
  Coordinate,
  DocumentType,
  IngestionState,
  LocationRecord,
  Provenance,
  RawAddressInput,
  SourceDocument,
} from "@pulse-brazil/domain";
import type { Account } from "@pulse-brazil/domain";
import type { ImportLocationCsvResultDto, LocationCsvRowErrorDto } from "../../dto/location/ImportLocationCsvResultDto.js";
import type { LocationRecordDto } from "../../dto/location/LocationRecordDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { IGeocoder } from "../../ports/IGeocoder.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { ILocationRecordRepository } from "../../ports/ILocationRecordRepository.js";
import { parseLocationCsv } from "../../validation/parseLocationCsv.js";
import { validateLocationCsvHeaders, validateLocationCsvRows } from "../../validation/LocationCsvRowValidator.js";

/** Shared with ListLocationRecordsForMap — one mapping from LocationRecord to its full reviewable DTO shape. */
export function toLocationRecordDto(record: LocationRecord): LocationRecordDto {
  return {
    id: record.id,
    kind: record.kind,
    label: record.label,
    rawAddress: {
      addressLine: record.rawAddress.addressLine,
      city: record.rawAddress.city,
      state: record.rawAddress.state,
      postalCode: record.rawAddress.postalCode,
      country: record.rawAddress.country,
    },
    normalizedAddress: record.normalizedAddress,
    unverifiedCoordinate: record.unverifiedCoordinate
      ? { latitude: record.unverifiedCoordinate.latitude, longitude: record.unverifiedCoordinate.longitude }
      : undefined,
    verifiedCoordinate: record.verifiedCoordinate
      ? { latitude: record.verifiedCoordinate.latitude, longitude: record.verifiedCoordinate.longitude }
      : undefined,
    verificationState: record.verificationState,
    reviewStatus: record.reviewStatus,
    linkedAccountId: record.linkedAccountId,
    linkedSignalId: record.linkedSignalId,
    eventDate: record.eventDate?.toISOString(),
    isPrimary: record.isPrimary,
    countryCode: record.countryCode,
    sourceDocumentId: record.sourceDocumentId,
    sourceRowNumber: record.sourceRowNumber,
    reviewNotes: record.reviewNotes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export interface ImportLocationCsvCommand {
  csvText: string;
  originalFilename?: string;
  uploadedBy?: string;
}

/**
 * The CSV upload pipeline: parse -> validate (deterministic, outside the
 * model) -> resolve account linkage -> geocode -> construct LocationRecords.
 * The upload itself is represented as a SourceDocument (declaredType
 * LocationDataset) moving through the existing ingestion state machine —
 * no separate "batch" entity. A partially-valid file still imports its
 * valid rows; it does not fail all-or-nothing.
 */
export class ImportLocationCsv {
  constructor(
    private readonly locationRecords: ILocationRecordRepository,
    private readonly documents: IDocumentRepository,
    private readonly accounts: IAccountRepository,
    private readonly geocoder: IGeocoder,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: ImportLocationCsvCommand): Promise<ImportLocationCsvResultDto> {
    if (!command.csvText.trim()) {
      throw new ValidationError("csvText must not be empty");
    }

    const { headers, rows } = parseLocationCsv(command.csvText);
    const missingHeaders = validateLocationCsvHeaders(headers);
    if (missingHeaders.length > 0) {
      throw new ValidationError(`CSV is missing required column(s): ${missingHeaders.join(", ")}`);
    }

    const { valid, invalid, duplicateRowNumbers } = validateLocationCsvRows(rows);
    const rejectedRows: LocationCsvRowErrorDto[] = [...invalid];

    const document = SourceDocument.receive({
      id: asDocumentId(this.idGenerator.newId()),
      declaredType: DocumentType.LocationDataset,
      provenance: Provenance.of({
        connectorSource: ConnectorSource.DocumentUpload,
        uploadedAt: new Date(),
        uploadedBy: command.uploadedBy,
        originalFilename: command.originalFilename,
      }),
    });
    await this.documents.save(document);
    const processingDocument = document.transitionTo(IngestionState.Processing);
    await this.documents.save(processingDocument);

    const allAccounts = await this.accounts.findAll();
    const accountsById = new Map<string, Account>(allAccounts.map((account) => [account.id, account]));
    const accountsByName = new Map<string, Account[]>();
    for (const account of allAccounts) {
      const key = account.name.trim().toLowerCase();
      accountsByName.set(key, [...(accountsByName.get(key) ?? []), account]);
    }

    const records: LocationRecordDto[] = [];

    for (const draft of valid) {
      const reasons: string[] = [];
      let linkedAccountId: string | undefined;

      if (draft.linkedAccountId) {
        if (accountsById.has(draft.linkedAccountId)) {
          linkedAccountId = draft.linkedAccountId;
        } else {
          reasons.push(`linked_account_id "${draft.linkedAccountId}" not found`);
        }
      } else if (draft.linkedAccountName) {
        const matches = accountsByName.get(draft.linkedAccountName.toLowerCase()) ?? [];
        if (matches.length === 1) {
          linkedAccountId = matches[0]!.id;
          reasons.push("linked via account name match — verify before trusting");
        } else if (matches.length > 1) {
          reasons.push(`"${draft.linkedAccountName}" matches ${matches.length} accounts — ambiguous, not linked`);
        } else {
          reasons.push(`no account found matching "${draft.linkedAccountName}"`);
        }
      }

      if (duplicateRowNumbers.has(draft.rowNumber)) {
        reasons.push("possible duplicate of another row in this upload (same label + address_line)");
      }

      try {
        let record = LocationRecord.receive({
          id: asLocationRecordId(this.idGenerator.newId()),
          kind: draft.kind,
          label: draft.label,
          rawAddress: RawAddressInput.of(draft.rawAddress),
          manualCoordinate:
            draft.latitude !== undefined && draft.longitude !== undefined
              ? Coordinate.of(draft.latitude, draft.longitude)
              : undefined,
          linkedAccountId: linkedAccountId ? asAccountId(linkedAccountId) : undefined,
          linkedSignalId: draft.linkedSignalId ? asSignalId(draft.linkedSignalId) : undefined,
          eventDate: draft.eventDate,
          isPrimary: draft.isPrimary,
          countryCode: draft.countryCode,
          sourceDocumentId: document.id,
          sourceRowNumber: draft.rowNumber,
          reviewNotes: draft.notes,
        });

        // A manual coordinate is already a trusted override — nothing to
        // geocode. Otherwise, attempt to resolve the address; a geocoder
        // "no match" is expected (per IGeocoder), not a failure, but it does
        // mean this record needs a human's attention before it's trusted.
        if (!record.verifiedCoordinate && !record.rawAddress.isEmpty) {
          const geocoded = await this.geocoder.geocode(record.rawAddress.toSingleLine());
          if (geocoded) {
            record = record.withGeocodedCoordinate(geocoded);
          } else {
            reasons.push("could not geocode address");
          }
        }

        if (reasons.length > 0) {
          record = record.flagForReview(reasons.join("; "));
        }

        await this.locationRecords.save(record);
        records.push(toLocationRecordDto(record));
      } catch (error) {
        rejectedRows.push({
          rowNumber: draft.rowNumber,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    const finalDocument = records.length > 0
      ? processingDocument.transitionTo(IngestionState.Classified).transitionTo(IngestionState.Linked)
      : processingDocument.transitionTo(IngestionState.Failed);
    await this.documents.save(finalDocument);

    return {
      sourceDocumentId: document.id,
      totalRows: rows.length,
      acceptedRows: records.length,
      rejectedRows,
      reviewRequiredCount: records.filter((record) => record.reviewStatus === "ReviewRequired").length,
      records,
    };
  }
}
