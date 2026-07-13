import {
  asAccountId,
  asDealId,
  asDocumentId,
  ConnectorSource,
  Deal,
  DocumentType,
  IngestionState,
  Provenance,
  SourceDocument,
} from "@pulse-brazil/domain";
import type { Account } from "@pulse-brazil/domain";
import type { DealDto } from "../../dto/pipeline/DealDto.js";
import type { ImportPipelineCsvResultDto, PipelineCsvRowErrorDto } from "../../dto/pipeline/ImportPipelineCsvResultDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IDealRepository } from "../../ports/IDealRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import { parseCsv } from "../../validation/parseCsv.js";
import { validatePipelineCsvHeaders, validatePipelineCsvRows } from "../../validation/PipelineCsvRowValidator.js";

/** Shared with GetPipelineSummary/GetTopOpenDeals — one mapping from Deal to its full DTO shape. */
export function toDealDto(deal: Deal): DealDto {
  return {
    id: deal.id,
    sourceDocumentId: deal.sourceDocumentId,
    sourceRowNumber: deal.sourceRowNumber,
    opportunityOwner: deal.opportunityOwner,
    accountNameRaw: deal.accountNameRaw,
    opportunityName: deal.opportunityName,
    stage: deal.stage,
    fiscalPeriod: deal.fiscalPeriod,
    amount: deal.amount,
    expectedRevenue: deal.expectedRevenue,
    probabilityPercent: deal.probabilityPercent,
    ageDays: deal.ageDays,
    revenueLiveDate: deal.revenueLiveDate?.toISOString(),
    nextStepSummary: deal.nextStepSummary,
    leadSource: deal.leadSource,
    type: deal.type,
    ownerRegion: deal.ownerRegion,
    linkedAccountId: deal.linkedAccountId,
    reviewStatus: deal.reviewStatus,
    reviewNotes: deal.reviewNotes,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}

export interface ImportPipelineCsvCommand {
  csvText: string;
  originalFilename?: string;
  uploadedBy?: string;
}

/**
 * The Pipeline CSV upload pipeline: parse -> validate (deterministic,
 * outside the model) -> resolve account linkage by name -> construct Deals.
 * The upload is represented as a SourceDocument (declaredType
 * PipelineDataset) moving through the existing ingestion state machine — no
 * separate "PipelineSnapshot" entity; this SourceDocument *is* the snapshot,
 * its provenance.uploadedAt *is* the "as of" time (see claude/INTEGRATION_PLAN.md
 * Feature 1). A partially-valid file still imports its valid rows. Every
 * valid row becomes a Deal regardless of account-match outcome — unmatched
 * or ambiguous account names are flagged for review, not dropped or
 * excluded from later totals (that filtering happens in
 * GetPipelineSummary/GetTopOpenDeals, at read time).
 */
export class ImportPipelineCsv {
  constructor(
    private readonly deals: IDealRepository,
    private readonly documents: IDocumentRepository,
    private readonly accounts: IAccountRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: ImportPipelineCsvCommand): Promise<ImportPipelineCsvResultDto> {
    if (!command.csvText.trim()) {
      throw new ValidationError("csvText must not be empty");
    }

    const { headers, rows } = parseCsv(command.csvText);
    const missingHeaders = validatePipelineCsvHeaders(headers);
    if (missingHeaders.length > 0) {
      throw new ValidationError(`CSV is missing required column(s): ${missingHeaders.join(", ")}`);
    }

    const { valid, invalid } = validatePipelineCsvRows(rows);
    const rejectedRows: PipelineCsvRowErrorDto[] = [...invalid];

    const document = SourceDocument.receive({
      id: asDocumentId(this.idGenerator.newId()),
      declaredType: DocumentType.PipelineDataset,
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
    const accountsByName = new Map<string, Account[]>();
    for (const account of allAccounts) {
      const key = account.name.trim().toLowerCase();
      accountsByName.set(key, [...(accountsByName.get(key) ?? []), account]);
    }

    const dealEntities: Deal[] = [];
    const dealDtos: DealDto[] = [];

    for (const draft of valid) {
      const reasons: string[] = [];
      let linkedAccountId: string | undefined;

      const matches = accountsByName.get(draft.accountName.toLowerCase()) ?? [];
      if (matches.length === 1) {
        linkedAccountId = matches[0]!.id;
        reasons.push("linked via account name match — verify before trusting");
      } else if (matches.length > 1) {
        reasons.push(`"${draft.accountName}" matches ${matches.length} accounts — ambiguous, not linked`);
      } else {
        reasons.push(`no account found matching "${draft.accountName}"`);
      }

      try {
        let deal = Deal.receive({
          id: asDealId(this.idGenerator.newId()),
          sourceDocumentId: document.id,
          sourceRowNumber: draft.rowNumber,
          opportunityOwner: draft.opportunityOwner,
          accountNameRaw: draft.accountName,
          opportunityName: draft.opportunityName,
          stage: draft.stage,
          fiscalPeriod: draft.fiscalPeriod,
          amount: draft.amount,
          expectedRevenue: draft.expectedRevenue,
          probabilityPercent: draft.probabilityPercent,
          ageDays: draft.ageDays,
          revenueLiveDate: draft.revenueLiveDate,
          nextStepSummary: draft.nextStepSummary,
          leadSource: draft.leadSource,
          type: draft.type,
          ownerRegion: draft.ownerRegion,
          linkedAccountId: linkedAccountId ? asAccountId(linkedAccountId) : undefined,
        });

        if (reasons.length > 0) {
          deal = deal.flagForReview(reasons.join("; "));
        }

        dealEntities.push(deal);
        dealDtos.push(toDealDto(deal));
      } catch (error) {
        rejectedRows.push({
          rowNumber: draft.rowNumber,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    if (dealEntities.length > 0) {
      await this.deals.saveMany(dealEntities);
    }

    const finalDocument = dealEntities.length > 0
      ? processingDocument.transitionTo(IngestionState.Classified).transitionTo(IngestionState.Linked)
      : processingDocument.transitionTo(IngestionState.Failed);
    await this.documents.save(finalDocument);

    return {
      sourceDocumentId: document.id,
      totalRows: rows.length,
      acceptedRows: dealEntities.length,
      rejectedRows,
      reviewRequiredCount: dealDtos.filter((deal) => deal.reviewStatus === "ReviewRequired").length,
      deals: dealDtos,
    };
  }
}
