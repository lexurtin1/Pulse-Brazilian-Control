import {
  asAccountId,
  asDocumentId,
  asThemeId,
  ConnectorSource,
  DocumentType,
  ExternalReference,
  ExternalSystem,
  Provenance,
  SourceDocument,
} from "@pulse-brazil/domain";
import type { DocumentDto } from "../../dto/document/DocumentDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";

function assertEnumMember<T extends Record<string, string>>(enumObject: T, value: string, fieldName: string): T[keyof T] {
  if (!Object.values(enumObject).includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${Object.values(enumObject).join(", ")}`);
  }
  return value as T[keyof T];
}

/** The one mapping from SourceDocument to its DTO shape. */
export function toDocumentDto(document: SourceDocument): DocumentDto {
  return {
    id: document.id,
    declaredType: document.declaredType,
    inferredType: document.inferredType,
    hasClassificationConflict: document.hasClassificationConflict,
    linkedAccountId: document.linkedAccountId,
    linkedThemeIds: [...document.linkedThemeIds],
    ingestionState: document.ingestionState,
    provenance: {
      connectorSource: document.provenance.connectorSource,
      uploadedAt: document.provenance.uploadedAt.toISOString(),
      uploadedBy: document.provenance.uploadedBy,
      originalFilename: document.provenance.originalFilename,
    },
    extractedReferenceIds: [...document.extractedReferences],
  };
}

export interface SubmitDocumentCommand {
  declaredType: string;
  connectorSource: string;
  linkedAccountId?: string;
  linkedThemeIds?: string[];
  uploadedBy?: string;
  originalFilename?: string;
  externalReference?: { system: string; externalId: string; url?: string };
}

/**
 * Receives a new source document into the ingestion pipeline (state
 * `Received`). Does not verify `linkedAccountId` against an account
 * repository — this use case only depends on IDocumentRepository and
 * IIdGenerator; account-existence validation belongs to a use case that
 * has an IAccountRepository dependency, if that becomes a requirement.
 */
export class SubmitDocument {
  constructor(
    private readonly documents: IDocumentRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: SubmitDocumentCommand): Promise<DocumentDto> {
    const declaredType = assertEnumMember(DocumentType, command.declaredType, "declaredType");
    const connectorSource = assertEnumMember(ConnectorSource, command.connectorSource, "connectorSource");

    const externalReference = command.externalReference
      ? ExternalReference.of({
          system: assertEnumMember(ExternalSystem, command.externalReference.system, "externalReference.system"),
          externalId: command.externalReference.externalId,
          url: command.externalReference.url,
        })
      : undefined;

    const provenance = Provenance.of({
      connectorSource,
      uploadedAt: new Date(),
      uploadedBy: command.uploadedBy,
      originalFilename: command.originalFilename,
      externalReference,
    });

    const document = SourceDocument.receive({
      id: asDocumentId(this.idGenerator.newId()),
      declaredType,
      linkedAccountId: command.linkedAccountId ? asAccountId(command.linkedAccountId) : undefined,
      linkedThemeIds: (command.linkedThemeIds ?? []).map(asThemeId),
      provenance,
    });

    await this.documents.save(document);
    return toDocumentDto(document);
  }
}
