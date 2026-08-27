import type { IAccountRepository } from "@pulse-brazil/application";
import {
  Account,
  type AccountId,
  AccountStatus,
  AccountType,
  asAccountId,
  asOfficeLocationId,
  asThemeId,
  ClientType,
  Coordinate,
  ExternalReference,
  ExternalSystem,
  GeographicScope,
  LocationVerificationState,
  OfficeLocation,
} from "@pulse-brazil/domain";
import type { Pool, PoolClient } from "@neondatabase/serverless";

interface CoordinateJson {
  latitude: number;
  longitude: number;
}

interface OfficeLocationJson {
  id: string;
  rawAddress: string;
  normalizedAddress: string | null;
  unverifiedCoordinate: CoordinateJson | null;
  verifiedCoordinate: CoordinateJson | null;
  verificationState: string;
  isPrimary: boolean;
}

interface ExternalReferenceJson {
  system: string;
  externalId: string;
  url: string | null;
}

interface AccountRow {
  id: string;
  name: string;
  account_type: string;
  status: string;
  geographic_scope: { countryCode: string; region: string | null; city: string | null };
  office_locations: OfficeLocationJson[];
  linked_theme_ids: string[];
  external_references: ExternalReferenceJson[];
  client_types: string[];
  account_owner: string | null;
  created_cohort_year: string | null;
  open_opportunity_count: number | null;
}

function coordinateFromJson(json: CoordinateJson | null): Coordinate | undefined {
  return json ? Coordinate.of(json.latitude, json.longitude) : undefined;
}

function coordinateToJson(coordinate: Coordinate | undefined): CoordinateJson | null {
  return coordinate ? { latitude: coordinate.latitude, longitude: coordinate.longitude } : null;
}

/**
 * Rebuilds an OfficeLocation by replaying it through the same public
 * factory chain the domain uses to build one forward — fromRawAddress,
 * then withGeocodedCoordinate if a geocoded coordinate was ever recorded,
 * then verify/override if a human confirmed or replaced it. Every valid
 * persisted state is reachable this way; no domain changes needed.
 */
function officeLocationFromJson(json: OfficeLocationJson): OfficeLocation {
  let office = OfficeLocation.fromRawAddress({
    id: asOfficeLocationId(json.id),
    rawAddress: json.rawAddress,
    normalizedAddress: json.normalizedAddress ?? undefined,
    isPrimary: json.isPrimary,
  });

  const unverified = coordinateFromJson(json.unverifiedCoordinate);
  if (unverified) {
    office = office.withGeocodedCoordinate(unverified);
  }

  const verified = coordinateFromJson(json.verifiedCoordinate);
  if (verified && json.verificationState === LocationVerificationState.ManuallyVerified) {
    office = office.verify(verified);
  } else if (verified && json.verificationState === LocationVerificationState.ManuallyOverridden) {
    office = office.override(verified);
  }

  return office;
}

function officeLocationToJson(office: OfficeLocation): OfficeLocationJson {
  return {
    id: office.id,
    rawAddress: office.rawAddress,
    normalizedAddress: office.normalizedAddress ?? null,
    unverifiedCoordinate: coordinateToJson(office.unverifiedCoordinate),
    verifiedCoordinate: coordinateToJson(office.verifiedCoordinate),
    verificationState: office.verificationState,
    isPrimary: office.isPrimary,
  };
}

function externalReferenceFromJson(json: ExternalReferenceJson): ExternalReference {
  return ExternalReference.of({
    system: json.system as ExternalSystem,
    externalId: json.externalId,
    url: json.url ?? undefined,
  });
}

function externalReferenceToJson(reference: ExternalReference): ExternalReferenceJson {
  return { system: reference.system, externalId: reference.externalId, url: reference.url ?? null };
}

function rowToAccount(row: AccountRow): Account {
  try {
    return Account.create({
      id: asAccountId(row.id),
      name: row.name,
      accountType: row.account_type as AccountType,
      status: row.status as AccountStatus,
      geographicScope: GeographicScope.of({
        countryCode: row.geographic_scope.countryCode,
        region: row.geographic_scope.region ?? undefined,
        city: row.geographic_scope.city ?? undefined,
      }),
      officeLocations: row.office_locations.map(officeLocationFromJson),
      linkedThemeIds: row.linked_theme_ids.map(asThemeId),
      externalReferences: row.external_references.map(externalReferenceFromJson),
      clientTypes: row.client_types.map((value) => value as ClientType),
      accountOwner: row.account_owner ?? undefined,
      createdCohortYear: row.created_cohort_year ?? undefined,
      openOpportunityCount: row.open_opportunity_count ?? undefined,
    });
  } catch (error) {
    throw new Error(`Failed to reconstruct Account ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Satisfies IAccountRepository. No ORM — plain parameterised SQL against the accounts table (see migrations/001_create_accounts.sql). */
export class PostgresAccountRepository implements IAccountRepository {
  constructor(private readonly pool: Pool | PoolClient) {}

  async findById(id: AccountId): Promise<Account | null> {
    const { rows } = await this.pool.query<AccountRow>("SELECT * FROM accounts WHERE id = $1", [id]);
    const [row] = rows;
    return row ? rowToAccount(row) : null;
  }

  /** Prevents concurrent Account deletion while a transaction creates a relationship to it. */
  async findByIdForLink(id: AccountId): Promise<Account | null> {
    const { rows } = await this.pool.query<AccountRow>("SELECT * FROM accounts WHERE id = $1 FOR KEY SHARE", [id]);
    const [row] = rows;
    return row ? rowToAccount(row) : null;
  }

  async findAll(): Promise<Account[]> {
    const { rows } = await this.pool.query<AccountRow>("SELECT * FROM accounts ORDER BY name");
    return rows.map(rowToAccount);
  }

  async findAllWithCoordinates(): Promise<Account[]> {
    const { rows } = await this.pool.query<AccountRow>(`
      SELECT * FROM accounts
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(office_locations) AS office
        WHERE (office->'verifiedCoordinate'->>'latitude') IS NOT NULL
           OR (office->'unverifiedCoordinate'->>'latitude') IS NOT NULL
      )
      ORDER BY name
    `);
    return rows.map(rowToAccount);
  }

  async save(account: Account): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO accounts (
        id, name, account_type, status, geographic_scope, office_locations,
        linked_theme_ids, external_references, client_types, account_owner,
        created_cohort_year, open_opportunity_count, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        account_type = EXCLUDED.account_type,
        status = EXCLUDED.status,
        geographic_scope = EXCLUDED.geographic_scope,
        office_locations = EXCLUDED.office_locations,
        linked_theme_ids = EXCLUDED.linked_theme_ids,
        external_references = EXCLUDED.external_references,
        client_types = EXCLUDED.client_types,
        account_owner = EXCLUDED.account_owner,
        created_cohort_year = EXCLUDED.created_cohort_year,
        open_opportunity_count = EXCLUDED.open_opportunity_count,
        updated_at = now()
      `,
      [
        account.id,
        account.name,
        account.accountType,
        account.status,
        JSON.stringify({
          countryCode: account.geographicScope.countryCode,
          region: account.geographicScope.region ?? null,
          city: account.geographicScope.city ?? null,
        }),
        JSON.stringify(account.officeLocations.map(officeLocationToJson)),
        JSON.stringify(account.linkedThemeIds),
        JSON.stringify(account.externalReferences.map(externalReferenceToJson)),
        JSON.stringify(account.clientTypes),
        account.accountOwner ?? null,
        account.createdCohortYear ?? null,
        account.openOpportunityCount ?? null,
      ],
    );
  }

  async delete(id: AccountId): Promise<void> {
    await this.pool.query("DELETE FROM accounts WHERE id = $1", [id]);
  }
}
