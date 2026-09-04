import {
  asDocumentId,
  ConnectorSource,
  DocumentType,
  EvidenceKind,
  IngestionState,
  Provenance,
  SignalOrigin,
  SourceDocument,
} from "@pulse-brazil/domain";
import type { ProcessDocumentUploadResultDto } from "../../dto/document/ProcessDocumentUploadResultDto.js";
import type { SignalDto } from "../../dto/signal/SignalDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { ClaudeDocumentContent, IClaudeService } from "../../ports/IClaudeService.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { CreateSignal } from "../signal/CreateSignal.js";
import type { ApplyExtractedUpdate } from "../update/ApplyExtractedUpdate.js";

function assertEnumMember<T extends Record<string, string>>(enumObject: T, value: string, fieldName: string): T[keyof T] {
  if (!Object.values(enumObject).includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${Object.values(enumObject).join(", ")}`);
  }
  return value as T[keyof T];
}

/** Claude's classification is advisory, not a command: an unrecognised value degrades to Other rather than failing an otherwise-good ingest. */
function toDocumentType(value: string): DocumentType {
  return Object.values(DocumentType).includes(value as DocumentType) ? (value as DocumentType) : DocumentType.Other;
}

export interface ProcessDocumentUploadCommand {
  documentContent: ClaudeDocumentContent;
  connectorSource: string;
  originalFilename?: string;
  uploadedBy?: string;
}

/**
 * The Document Ingest pipeline: receive a document, ask Claude to extract
 * signals about accounts that already exist, create those signals through
 * the already-built CreateSignal, and move the document through its
 * ingestion lifecycle — same SourceDocument state machine and finalization
 * pattern ImportLocationCsv already established.
 *
 * Deliberately does not create new accounts from AI output. Signal already
 * carries origin/evidence/confidence for traceability; Account has no such
 * concept at all, so nothing untraceable enters the operational account
 * list unreviewed. A mention with no matching known account is surfaced via
 * unmatchedAccountMentions, never auto-created.
 *
 * The uploader no longer declares what a document is — `declaredType` stays
 * Other and Claude's reading lands in `inferredType`, which is exactly the
 * distinction SourceDocument was built to keep.
 */
export class ProcessDocumentUpload {
  constructor(
    private readonly documents: IDocumentRepository,
    private readonly accounts: IAccountRepository,
    private readonly claudeService: IClaudeService,
    private readonly createSignal: CreateSignal,
    private readonly idGenerator: IIdGenerator,
    private readonly applyExtractedUpdate: ApplyExtractedUpdate,
  ) {}

  async execute(command: ProcessDocumentUploadCommand): Promise<ProcessDocumentUploadResultDto> {
    const connectorSource = assertEnumMember(ConnectorSource, command.connectorSource, "connectorSource");
    // Every signal this pipeline creates is SignalOrigin.MachineDerived, and
    // Signal.of forbids pairing MachineDerived with ConnectorSource.ManualEntry
    // — reject up front rather than spending a Claude call and failing deep
    // inside the loop below.
    if (connectorSource === ConnectorSource.ManualEntry) {
      throw new ValidationError(
        "connectorSource must not be ManualEntry for document ingest — signals extracted here are always MachineDerived, which cannot use ManualEntry as their source",
      );
    }

    const document = SourceDocument.receive({
      id: asDocumentId(this.idGenerator.newId()),
      declaredType: DocumentType.Other,
      provenance: Provenance.of({
        connectorSource,
        uploadedAt: new Date(),
        uploadedBy: command.uploadedBy,
        originalFilename: command.originalFilename,
      }),
    });
    await this.documents.save(document);
    const processingDocument = document.transitionTo(IngestionState.Processing);
    await this.documents.save(processingDocument);

    let signalsCreated: SignalDto[] = [];
    let unmatchedAccountMentions: string[] = [];
    let inferredType = DocumentType.Other;
    let latestUpdateRefreshed = false;
    let latestUpdateBlockedFields: string[] = [];
    try {
      const allAccounts = await this.accounts.findAll();
      const knownAccountIds = new Set(allAccounts.map((account) => account.id as string));
      const knownAccounts = allAccounts.map((account) => ({ id: account.id as string, name: account.name }));

      const extraction = await this.claudeService.readDocument({
        documentContent: command.documentContent,
        knownAccounts,
      });
      unmatchedAccountMentions = extraction.unmatchedAccountMentions;
      inferredType = toDocumentType(extraction.documentType);

      for (const candidate of extraction.signals) {
        // Claude was instructed to leave accountId null for anything outside
        // knownAccounts; anything else non-matching is either that (expected —
        // surfaced via unmatchedAccountMentions instead) or a disobedient id.
        // Never trust it either way — this is the defense-in-depth check.
        if (!candidate.accountId || !knownAccountIds.has(candidate.accountId)) {
          continue;
        }

        const signal = await this.createSignal.execute({
          source: connectorSource,
          type: candidate.type,
          title: candidate.title,
          summary: candidate.summary,
          linkedAccountIds: [candidate.accountId],
          confidenceScore: candidate.confidence,
          origin: SignalOrigin.MachineDerived,
          dateObserved: candidate.dateObserved ?? undefined,
          evidence: [{ kind: EvidenceKind.SourceDocument, referenceId: document.id }],
        });
        signalsCreated.push(signal);
      }

      if (extraction.latestUpdate) {
        const applied = await this.applyExtractedUpdate.execute({
          draft: extraction.latestUpdate,
          sourceDocumentId: document.id,
          knownAccountIds,
        });
        latestUpdateBlockedFields = [...applied.blockedFields];
        latestUpdateRefreshed = true;
      }
    } catch (error) {
      // Never leave a document stuck in Processing forever — a failed
      // extraction or signal-creation call is a visible Failed state, not a
      // silent hang, and the error still propagates to the caller.
      await this.documents.save(processingDocument.transitionTo(IngestionState.Failed));
      throw error;
    }

    // A document that produced neither a signal nor an update told us
    // nothing — that is a Failed ingest. One that refreshed the Brazil update
    // but matched no account is still a success, which is why this is no
    // longer a signals-only test.
    const classified = processingDocument.withInferredType(inferredType);
    const producedSomething = signalsCreated.length > 0 || latestUpdateRefreshed;
    const finalDocument = producedSomething
      ? classified.transitionTo(IngestionState.Classified).transitionTo(IngestionState.Linked)
      : classified.transitionTo(IngestionState.Failed);
    await this.documents.save(finalDocument);

    return {
      sourceDocumentId: document.id,
      documentType: inferredType,
      signalsCreated,
      unmatchedAccountMentions,
      latestUpdateRefreshed,
      latestUpdateBlockedFields,
    };
  }
}
