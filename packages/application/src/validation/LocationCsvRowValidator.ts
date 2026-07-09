import { LocationRecordKind } from "@pulse-brazil/domain";

/**
 * Deterministic CSV row validation, kept entirely outside the domain model
 * per the "keep deterministic validation outside the model" rule — this
 * produces a plain draft or a list of errors; only a valid draft is ever
 * turned into a LocationRecord (see ImportLocationCsv).
 */
export interface LocationRecordDraft {
  rowNumber: number;
  kind: LocationRecordKind;
  label: string;
  rawAddress: {
    addressLine?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  linkedAccountId?: string;
  linkedAccountName?: string;
  linkedSignalId?: string;
  eventDate?: Date;
  isPrimary: boolean;
  countryCode: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export interface LocationCsvRowError {
  rowNumber: number;
  errors: string[];
}

export interface LocationCsvValidationResult {
  valid: LocationRecordDraft[];
  invalid: LocationCsvRowError[];
}

/** The strict, fixed header contract — see Phase 1 design doc. */
export const REQUIRED_LOCATION_CSV_COLUMNS = ["record_kind", "label"] as const;

export const KNOWN_LOCATION_CSV_COLUMNS = [
  "record_kind",
  "label",
  "linked_account_id",
  "linked_account_name",
  "linked_signal_id",
  "address_line",
  "city",
  "state",
  "postal_code",
  "country",
  "latitude",
  "longitude",
  "event_date",
  "is_primary",
  "notes",
] as const;

/** Missing-required-column check happens once for the whole file, before any row is processed. */
export function validateLocationCsvHeaders(headers: string[]): string[] {
  const present = new Set(headers.map((header) => header.toLowerCase()));
  return REQUIRED_LOCATION_CSV_COLUMNS.filter((column) => !present.has(column));
}

const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseKind(raw: string): LocationRecordKind | null {
  const match = Object.values(LocationRecordKind).find((kind) => kind.toLowerCase() === raw.trim().toLowerCase());
  return match ?? null;
}

function parseBoolean(raw: string | undefined): boolean {
  return (raw ?? "").trim().toLowerCase() === "true";
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw || !raw.trim()) return undefined;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Validates one already-split CSV row against the fixed contract. Returns
 * either a draft (never a domain entity — construction happens later, once
 * account linkage and geocoding are resolved) or a list of row-level errors.
 */
export function validateLocationCsvRow(row: Record<string, string>, rowNumber: number): LocationRecordDraft | LocationCsvRowError {
  const errors: string[] = [];

  const kindRaw = row.record_kind ?? "";
  const kind = parseKind(kindRaw);
  if (!kind) {
    errors.push(`record_kind must be one of: ${Object.values(LocationRecordKind).join(", ")} (got "${kindRaw}")`);
  }

  const label = (row.label ?? "").trim();
  if (!label) {
    errors.push("label must not be empty");
  }

  const latitudeRaw = row.latitude?.trim();
  const longitudeRaw = row.longitude?.trim();
  const hasLatitude = Boolean(latitudeRaw);
  const hasLongitude = Boolean(longitudeRaw);
  if (hasLatitude !== hasLongitude) {
    errors.push("latitude and longitude must both be supplied together, or not at all");
  }
  const latitude = hasLatitude ? parseNumber(latitudeRaw) : undefined;
  const longitude = hasLongitude ? parseNumber(longitudeRaw) : undefined;
  if (hasLatitude && latitude === undefined) errors.push(`latitude is not a valid number: "${latitudeRaw}"`);
  if (hasLongitude && longitude === undefined) errors.push(`longitude is not a valid number: "${longitudeRaw}"`);
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) errors.push("latitude must be between -90 and 90");
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) errors.push("longitude must be between -180 and 180");

  const rawAddress = {
    addressLine: row.address_line?.trim() || undefined,
    city: row.city?.trim() || undefined,
    state: row.state?.trim() || undefined,
    postalCode: row.postal_code?.trim() || undefined,
    country: row.country?.trim() || undefined,
  };
  const hasAddress = Boolean(rawAddress.addressLine && rawAddress.city && rawAddress.state);
  const hasCoordinate = latitude !== undefined && longitude !== undefined;
  if (!hasAddress && !hasCoordinate) {
    errors.push("a row must supply either address_line + city + state, or latitude + longitude");
  }

  let eventDate: Date | undefined;
  const eventDateRaw = row.event_date?.trim();
  if (kind === LocationRecordKind.Event || kind === LocationRecordKind.Visit) {
    if (!eventDateRaw) {
      errors.push("event_date is required when record_kind is Event or Visit");
    } else if (!EVENT_DATE_PATTERN.test(eventDateRaw)) {
      errors.push(`event_date must be ISO 8601 (YYYY-MM-DD), got "${eventDateRaw}"`);
    } else {
      const parsed = new Date(`${eventDateRaw}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        errors.push(`event_date is not a valid date: "${eventDateRaw}"`);
      } else {
        eventDate = parsed;
      }
    }
  }

  const isPrimary = parseBoolean(row.is_primary);
  if (isPrimary && kind !== LocationRecordKind.Office) {
    errors.push("is_primary may only be true when record_kind is Office");
  }

  if (errors.length > 0) {
    return { rowNumber, errors };
  }

  return {
    rowNumber,
    kind: kind as LocationRecordKind,
    label,
    rawAddress,
    linkedAccountId: row.linked_account_id?.trim() || undefined,
    linkedAccountName: row.linked_account_name?.trim() || undefined,
    linkedSignalId: row.linked_signal_id?.trim() || undefined,
    eventDate,
    isPrimary,
    countryCode: row.country?.trim().toUpperCase() || "BR",
    latitude,
    longitude,
    notes: row.notes?.trim() || undefined,
  };
}

/** Validates every row; duplicate label+address_line pairs within the batch are accepted but reported so the caller can flag them for review. */
export function validateLocationCsvRows(rows: Record<string, string>[]): LocationCsvValidationResult & { duplicateRowNumbers: Set<number> } {
  const valid: LocationRecordDraft[] = [];
  const invalid: LocationCsvRowError[] = [];
  const seen = new Map<string, number>();
  const duplicateRowNumbers = new Set<number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for 1-indexing, +1 for the header row
    const result = validateLocationCsvRow(row, rowNumber);
    if ("errors" in result) {
      invalid.push(result);
      return;
    }
    valid.push(result);

    const key = `${result.label.toLowerCase()}|${(result.rawAddress.addressLine ?? "").toLowerCase()}`;
    if (seen.has(key)) {
      duplicateRowNumbers.add(rowNumber);
      duplicateRowNumbers.add(seen.get(key)!);
    } else {
      seen.set(key, rowNumber);
    }
  });

  return { valid, invalid, duplicateRowNumbers };
}
