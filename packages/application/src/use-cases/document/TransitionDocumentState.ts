import { asDocumentId, IngestionState } from "@pulse-brazil/domain";
import type { DocumentDto } from "../../dto/document/DocumentDto.js";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import { toDocumentDto } from "./SubmitDocument.js";

export interface TransitionDocumentStateCommand {
  documentId: string;
  nextState: string;
}

function assertIngestionState(value: string): IngestionState {
  if (!Object.values(IngestionState).includes(value as IngestionState)) {
    throw new ValidationError(`nextState must be one of: ${Object.values(IngestionState).join(", ")}`);
  }
  return value as IngestionState;
}

/**
 * Moves a document to its next ingestion state. Illegal transitions (e.g.
 * `Received` straight to `Linked`) are rejected by SourceDocument.transitionTo
 * itself, which throws the domain's InvariantViolationError — that error is
 * allowed to propagate unchanged rather than being wrapped, since it's
 * already a precise, meaningful description of what went wrong.
 */
export class TransitionDocumentState {
  constructor(private readonly documents: IDocumentRepository) {}

  async execute(command: TransitionDocumentStateCommand): Promise<DocumentDto> {
    if (!command.documentId.trim()) {
      throw new ValidationError("documentId is required");
    }
    const documentId = asDocumentId(command.documentId);

    const document = await this.documents.findById(documentId);
    if (!document) {
      throw new NotFoundError("SourceDocument", command.documentId);
    }

    const nextState = assertIngestionState(command.nextState);
    const updatedDocument = document.transitionTo(nextState);

    await this.documents.save(updatedDocument);
    return toDocumentDto(updatedDocument);
  }
}
