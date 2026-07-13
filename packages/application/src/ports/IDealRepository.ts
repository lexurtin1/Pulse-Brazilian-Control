import type { Deal, DocumentId } from "@pulse-brazil/domain";

/** Persistence contract for Deal. No implementation here — infrastructure provides one (Postgres). */
export interface IDealRepository {
  findBySourceDocumentId(sourceDocumentId: DocumentId): Promise<Deal[]>;
  /** One CSV upload creates its deals as a single known batch — no per-row async side effects, so a bulk write is the natural shape (unlike LocationRecord's geocode-then-save loop). */
  saveMany(deals: Deal[]): Promise<void>;
}
