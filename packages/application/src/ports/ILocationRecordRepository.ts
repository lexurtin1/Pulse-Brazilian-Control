import type { DocumentId, LocationRecord, LocationRecordId } from "@pulse-brazil/domain";

/** Persistence contract for LocationRecord. No implementation here — infrastructure provides one (Postgres/PostGIS). */
export interface ILocationRecordRepository {
  findById(id: LocationRecordId): Promise<LocationRecord | null>;
  /** Records with a resolved coordinate, excluding Rejected — the map-placement eligibility rule, applied once here. */
  findAllEligibleForMap(): Promise<LocationRecord[]>;
  findBySourceDocumentId(sourceDocumentId: DocumentId): Promise<LocationRecord[]>;
  save(record: LocationRecord): Promise<void>;
}
