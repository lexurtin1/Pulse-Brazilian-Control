import type { AccountId, DocumentId, DocumentType, SourceDocument } from "@pulse-brazil/domain";

export interface IDocumentRepository {
  findById(id: DocumentId): Promise<SourceDocument | null>;
  findByAccountId(accountId: AccountId): Promise<SourceDocument[]>;
  /** Newest first (by provenance.uploadedAt) — used to find "the latest snapshot" for a given upload type, e.g. PipelineDataset. */
  findByDeclaredType(declaredType: DocumentType): Promise<SourceDocument[]>;
  save(document: SourceDocument): Promise<void>;
}
