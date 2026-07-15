import type { ISignalRepository } from "@pulse-brazil/application";
import { toEvidenceReference } from "@pulse-brazil/application";
import {
  type AccountId,
  asAccountId,
  asSignalId,
  asThemeId,
  ConfidenceScore,
  ConnectorSource,
  GeographicScope,
  Signal,
  type SignalId,
  SignalOrigin,
  SignalType,
} from "@pulse-brazil/domain";
import type { Pool } from "@neondatabase/serverless";

interface EvidenceReferenceJson {
  kind: string;
  referenceId: string | null;
  excerpt: string | null;
  locator: string | null;
}

interface GeographicScopeJson {
  countryCode: string;
  region: string | null;
  city: string | null;
}

interface SignalRow {
  id: string;
  source: string;
  type: string;
  title: string;
  summary: string;
  linked_account_ids: string[];
  linked_theme_ids: string[];
  geographic_scope: GeographicScopeJson | null;
  date_observed: Date;
  evidence: EvidenceReferenceJson[];
  confidence: string;
  origin: string;
}

/**
 * linked_account_ids is no longer a column on signals
 * (migrations/019_canonicalize_account_signal_links.sql) — Signal is the
 * authoritative side of the relationship, now stored in account_signals.
 * Computed here on every read so the row still matches what rowToSignal
 * expects; save() writes account_signals directly instead of this column.
 */
const SIGNAL_COMPUTED_COLUMNS = `
  COALESCE(
    (SELECT jsonb_agg(account_signals.account_id) FROM account_signals WHERE account_signals.signal_id = signals.id),
    '[]'::jsonb
  ) AS linked_account_ids
`;

/**
 * Builds the parameterised INSERT for account_signals — repeated
 * (account_id, signal_id) placeholder pairs.
 */
function insertAccountSignalsSql(count: number): string {
  const rows = Array.from({ length: count }, (_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`);
  return `INSERT INTO account_signals (account_id, signal_id) VALUES ${rows.join(", ")}`;
}

function insertAccountSignalsParams(signal: Signal): unknown[] {
  return signal.linkedAccountIds.flatMap((accountId) => [accountId, signal.id]);
}

function evidenceReferenceToJson(evidence: { kind: string; referenceId?: string; excerpt?: string; locator?: string }): EvidenceReferenceJson {
  return {
    kind: evidence.kind,
    referenceId: evidence.referenceId ?? null,
    excerpt: evidence.excerpt ?? null,
    locator: evidence.locator ?? null,
  };
}

function rowToSignal(row: SignalRow): Signal {
  try {
    return Signal.of({
      id: asSignalId(row.id),
      source: row.source as ConnectorSource,
      type: row.type as SignalType,
      title: row.title,
      summary: row.summary,
      linkedAccountIds: row.linked_account_ids.map(asAccountId),
      linkedThemeIds: row.linked_theme_ids.map(asThemeId),
      geographicScope: row.geographic_scope
        ? GeographicScope.of({
            countryCode: row.geographic_scope.countryCode,
            region: row.geographic_scope.region ?? undefined,
            city: row.geographic_scope.city ?? undefined,
          })
        : undefined,
      dateObserved: row.date_observed,
      evidence: row.evidence.map((json) =>
        toEvidenceReference({ kind: json.kind, referenceId: json.referenceId ?? undefined, excerpt: json.excerpt ?? undefined, locator: json.locator ?? undefined }),
      ),
      confidence: ConfidenceScore.of(Number(row.confidence)),
      origin: row.origin as SignalOrigin,
    });
  } catch (error) {
    throw new Error(`Failed to reconstruct Signal ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Satisfies ISignalRepository. No ORM — plain parameterised SQL against the signals table (see migrations/002_create_signals.sql). */
export class PostgresSignalRepository implements ISignalRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: SignalId): Promise<Signal | null> {
    const { rows } = await this.pool.query<SignalRow>(
      `SELECT signals.*, ${SIGNAL_COMPUTED_COLUMNS} FROM signals WHERE id = $1`,
      [id],
    );
    const [row] = rows;
    return row ? rowToSignal(row) : null;
  }

  async findByAccountId(accountId: AccountId): Promise<Signal[]> {
    const { rows } = await this.pool.query<SignalRow>(
      `
      SELECT signals.*, ${SIGNAL_COMPUTED_COLUMNS}
      FROM signals
      JOIN account_signals ON account_signals.signal_id = signals.id
      WHERE account_signals.account_id = $1
      ORDER BY signals.date_observed DESC
      `,
      [accountId],
    );
    return rows.map(rowToSignal);
  }

  async findRecent(limit: number): Promise<Signal[]> {
    const { rows } = await this.pool.query<SignalRow>(
      `SELECT signals.*, ${SIGNAL_COMPUTED_COLUMNS} FROM signals ORDER BY date_observed DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToSignal);
  }

  async findMostRecentByType(type: SignalType): Promise<Signal | null> {
    const { rows } = await this.pool.query<SignalRow>(
      `SELECT signals.*, ${SIGNAL_COMPUTED_COLUMNS} FROM signals WHERE type = $1 ORDER BY date_observed DESC LIMIT 1`,
      [type],
    );
    const [row] = rows;
    return row ? rowToSignal(row) : null;
  }

  async save(signal: Signal): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `
        INSERT INTO signals (
          id, source, type, title, summary, linked_theme_ids,
          geographic_scope, date_observed, evidence, confidence, origin
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          source = EXCLUDED.source,
          type = EXCLUDED.type,
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          linked_theme_ids = EXCLUDED.linked_theme_ids,
          geographic_scope = EXCLUDED.geographic_scope,
          date_observed = EXCLUDED.date_observed,
          evidence = EXCLUDED.evidence,
          confidence = EXCLUDED.confidence,
          origin = EXCLUDED.origin
        `,
        [
          signal.id,
          signal.source,
          signal.type,
          signal.title,
          signal.summary,
          JSON.stringify(signal.linkedThemeIds),
          signal.geographicScope
            ? JSON.stringify({
                countryCode: signal.geographicScope.countryCode,
                region: signal.geographicScope.region ?? null,
                city: signal.geographicScope.city ?? null,
              })
            : null,
          signal.dateObserved,
          JSON.stringify(signal.evidence.map(evidenceReferenceToJson)),
          signal.confidence.toNumber(),
          signal.origin,
        ],
      );

      await client.query("DELETE FROM account_signals WHERE signal_id = $1", [signal.id]);

      if (signal.linkedAccountIds.length > 0) {
        await client.query(insertAccountSignalsSql(signal.linkedAccountIds.length), insertAccountSignalsParams(signal));
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** account_signals rows cascade-delete via signal_id's ON DELETE CASCADE (migrations/019). */
  async deleteAll(): Promise<void> {
    await this.pool.query("DELETE FROM signals");
  }
}
