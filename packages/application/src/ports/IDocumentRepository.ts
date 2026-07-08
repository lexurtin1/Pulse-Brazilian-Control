import type { AccountId, DocumentId, SourceDocument } from "@pulse-brazil/domain";

export interface IDocumentRepository {
  findById(id: DocumentId): Promise<SourceDocument | null>;
  findByAccountId(accountId: AccountId): Promise<SourceDocument[]>;
  save(document: SourceDocument): Promise<void>;
}
