import type { ILocationRecordRepository } from "@pulse-brazil/application";
import {
  asAccountId,
  asDocumentId,
  asLocationRecordId,
  asSignalId,
  Coordinate,
  type DocumentId,
  LocationRecord,
  type LocationRecordId,
  type LocationRecordKind,
  type LocationRecordProps,
  LocationVerificationState,
  RawAddressInput,
  RecordReviewStatus,
} from "@pulse-brazil/domain";
import type { Pool } from "@neondatabase/serverless";

interface LocationRecordRow {
  id: string;
  kind: string;
  label: string;
  raw_address_line: string | null;
  raw_city: string | null;
  raw_state: string | null;
  raw_postal_code: string | null;
  raw_country: string | null;
  normalized_address: string | null;
  unverified_latitude: number | null;
  unverified_longitude: number | null;
  verified_latitude: number | null;
  verified_longitude: number | null;
  verification_state: string;
  review_status: string;
  linked_account_id: string | null;
  linked_signal_id: string | null;
  event_date: string | Date | null;
  is_primary: boolean;
  country_code: string;
  source_document_id: string;
  source_row_number: number;
  review_notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function rowToLocationRecord(row: LocationRecordRow): LocationRecord {
  const props: LocationRecordProps = {
    id: asLocationRecordId(row.id),
    kind: row.kind as LocationRecordKind,
    label: row.label,
    rawAddress: RawAddressInput.of({
      addressLine: row.raw_address_line ?? undefined,
      city: row.raw_city ?? undefined,
      state: row.raw_state ?? undefined,
      postalCode: row.raw_postal_code ?? undefined,
      country: row.raw_country ?? undefined,
    }),
    normalizedAddress: row.normalized_address ?? undefined,
    unverifiedCoordinate:
      row.unverified_latitude !== null && row.unverified_longitude !== null
        ? Coordinate.of(row.unverified_latitude, row.unverified_longitude)
        : undefined,
    verifiedCoordinate:
      row.verified_latitude !== null && row.verified_longitude !== null
        ? Coordinate.of(row.verified_latitude, row.verified_longitude)
        : undefined,
    verificationState: row.verification_state as LocationVerificationState,
    reviewStatus: row.review_status as RecordReviewStatus,
    linkedAccountId: row.linked_account_id ? asAccountId(row.linked_account_id) : undefined,
    linkedSignalId: row.linked_signal_id ? asSignalId(row.linked_signal_id) : undefined,
    eventDate: row.event_date ? new Date(row.event_date) : undefined,
    isPrimary: row.is_primary,
    countryCode: row.country_code,
    sourceDocumentId: asDocumentId(row.source_document_id),
    sourceRowNumber: row.source_row_number,
    reviewNotes: row.review_notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
  return LocationRecord.reconstruct(props);
}

/**
 * Satisfies ILocationRecordRepository. No ORM — plain parameterised SQL
 * against the location_records table (see migrations/012). resolved_point
 * (the PostGIS geography column) is computed here from
 * verified ?? unverified coordinates on every save — this repository is the
 * only writer of this table, so that's sufficient without a DB trigger.
 */
export class PostgresLocationRecordRepository implements ILocationRecordRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: LocationRecordId): Promise<LocationRecord | null> {
    const { rows } = await this.pool.query<LocationRecordRow>("SELECT * FROM location_records WHERE id = $1", [id]);
    const [row] = rows;
    return row ? rowToLocationRecord(row) : null;
  }

  async findAllEligibleForMap(): Promise<LocationRecord[]> {
    const { rows } = await this.pool.query<LocationRecordRow>(
      `SELECT * FROM location_records
       WHERE resolved_point IS NOT NULL AND review_status != $1
       ORDER BY created_at DESC`,
      [RecordReviewStatus.Rejected],
    );
    return rows.map(rowToLocationRecord);
  }

  async findBySourceDocumentId(sourceDocumentId: DocumentId): Promise<LocationRecord[]> {
    const { rows } = await this.pool.query<LocationRecordRow>(
      "SELECT * FROM location_records WHERE source_document_id = $1 ORDER BY source_row_number ASC",
      [sourceDocumentId],
    );
    return rows.map(rowToLocationRecord);
  }

  async save(record: LocationRecord): Promise<void> {
    const best = record.verifiedCoordinate ?? record.unverifiedCoordinate;

    await this.pool.query(
      `
      INSERT INTO location_records (
        id, kind, label,
        raw_address_line, raw_city, raw_state, raw_postal_code, raw_country,
        normalized_address,
        unverified_latitude, unverified_longitude,
        verified_latitude, verified_longitude,
        verification_state, review_status,
        linked_account_id, linked_signal_id, event_date, is_primary, country_code,
        source_document_id, source_row_number, review_notes,
        resolved_point,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8,
        $9,
        $10, $11,
        $12, $13,
        $14, $15,
        $16, $17, $18, $19, $20,
        $21, $22, $23,
        CASE WHEN $24::double precision IS NOT NULL AND $25::double precision IS NOT NULL
             THEN ST_SetSRID(ST_MakePoint($24::double precision, $25::double precision), 4326)::geography
             ELSE NULL END,
        $26, $27
      )
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind,
        label = EXCLUDED.label,
        raw_address_line = EXCLUDED.raw_address_line,
        raw_city = EXCLUDED.raw_city,
        raw_state = EXCLUDED.raw_state,
        raw_postal_code = EXCLUDED.raw_postal_code,
        raw_country = EXCLUDED.raw_country,
        normalized_address = EXCLUDED.normalized_address,
        unverified_latitude = EXCLUDED.unverified_latitude,
        unverified_longitude = EXCLUDED.unverified_longitude,
        verified_latitude = EXCLUDED.verified_latitude,
        verified_longitude = EXCLUDED.verified_longitude,
        verification_state = EXCLUDED.verification_state,
        review_status = EXCLUDED.review_status,
        linked_account_id = EXCLUDED.linked_account_id,
        linked_signal_id = EXCLUDED.linked_signal_id,
        event_date = EXCLUDED.event_date,
        is_primary = EXCLUDED.is_primary,
        country_code = EXCLUDED.country_code,
        review_notes = EXCLUDED.review_notes,
        resolved_point = EXCLUDED.resolved_point,
        updated_at = EXCLUDED.updated_at
      `,
      [
        record.id,
        record.kind,
        record.label,
        record.rawAddress.addressLine ?? null,
        record.rawAddress.city ?? null,
        record.rawAddress.state ?? null,
        record.rawAddress.postalCode ?? null,
        record.rawAddress.country ?? null,
        record.normalizedAddress ?? null,
        record.unverifiedCoordinate?.latitude ?? null,
        record.unverifiedCoordinate?.longitude ?? null,
        record.verifiedCoordinate?.latitude ?? null,
        record.verifiedCoordinate?.longitude ?? null,
        record.verificationState,
        record.reviewStatus,
        record.linkedAccountId ?? null,
        record.linkedSignalId ?? null,
        record.eventDate ?? null,
        record.isPrimary,
        record.countryCode,
        record.sourceDocumentId,
        record.sourceRowNumber,
        record.reviewNotes ?? null,
        best?.longitude ?? null,
        best?.latitude ?? null,
        record.createdAt,
        record.updatedAt,
      ],
    );
  }
}
