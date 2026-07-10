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

function assertEnumMember<T extends Record<string, string>>(enumObject: T, value: string, fieldName: string): T[keyof T] {
  if (!Object.values(enumObject).includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${Object.values(enumObject).join(", ")}`);
  }
  return value as T[keyof T];
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
 */
export class ProcessDocumentUpload {
  constructor(
    private readonly documents: IDocumentRepository,
    private readonly accounts: IAccountRepository,
    private readonly claudeService: IClaudeService,
    private readonly createSignal: CreateSignal,
    private readonly idGenerator: IIdGenerator,
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
    try {
      const allAccounts = await this.accounts.findAll();
      const knownAccountIds = new Set(allAccounts.map((account) => account.id as string));
      const knownAccounts = allAccounts.map((account) => ({ id: account.id as string, name: account.name }));

      const extraction = await this.claudeService.extractSignalsFromDocument({
        documentContent: command.documentContent,
        knownAccounts,
      });
      unmatchedAccountMentions = extraction.unmatchedAccountMentions;

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
    } catch (error) {
      // Never leave a document stuck in Processing forever — a failed
      // extraction or signal-creation call is a visible Failed state, not a
      // silent hang, and the error still propagates to the caller.
      await this.documents.save(processingDocument.transitionTo(IngestionState.Failed));
      throw error;
    }

    const finalDocument =
      signalsCreated.length > 0
        ? processingDocument.transitionTo(IngestionState.Classified).transitionTo(IngestionState.Linked)
        : processingDocument.transitionTo(IngestionState.Failed);
    await this.documents.save(finalDocument);

    return {
      sourceDocumentId: document.id,
      signalsCreated,
      unmatchedAccountMentions,
    };
  }
}
