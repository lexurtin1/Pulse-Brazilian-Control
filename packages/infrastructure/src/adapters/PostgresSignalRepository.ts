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
import type { Pool, PoolClient } from "@neondatabase/serverless";

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

const SIGNAL_SELECT = `
  SELECT s.*,
    ARRAY(
      SELECT relation.account_id
      FROM account_signals AS relation
      WHERE relation.signal_id = s.id
      ORDER BY relation.account_id
    ) AS linked_account_ids
  FROM signals AS s
`;

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
  constructor(private readonly pool: Pool | PoolClient) {}

  async findById(id: SignalId): Promise<Signal | null> {
    const { rows } = await this.pool.query<SignalRow>(`${SIGNAL_SELECT} WHERE s.id = $1`, [id]);
    const [row] = rows;
    return row ? rowToSignal(row) : null;
  }

  async findByAccountId(accountId: AccountId): Promise<Signal[]> {
    const { rows } = await this.pool.query<SignalRow>(
      `${SIGNAL_SELECT}
       WHERE EXISTS (
         SELECT 1 FROM account_signals AS relation
         WHERE relation.signal_id = s.id AND relation.account_id = $1
       )
       ORDER BY s.date_observed DESC`,
      [accountId],
    );
    return rows.map(rowToSignal);
  }

  async findRecent(limit: number): Promise<Signal[]> {
    const { rows } = await this.pool.query<SignalRow>(
      `${SIGNAL_SELECT} ORDER BY s.date_observed DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToSignal);
  }

  async findMostRecentByType(type: SignalType): Promise<Signal | null> {
    const { rows } = await this.pool.query<SignalRow>(
      `${SIGNAL_SELECT} WHERE s.type = $1 ORDER BY s.date_observed DESC LIMIT 1`,
      [type],
    );
    const [row] = rows;
    return row ? rowToSignal(row) : null;
  }

  async save(signal: Signal): Promise<void> {
    await this.pool.query(
      `
      WITH saved_signal AS (
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
      RETURNING id
      ), deleted_links AS (
        DELETE FROM account_signals
        WHERE signal_id IN (SELECT id FROM saved_signal)
      )
      INSERT INTO account_signals (account_id, signal_id)
      SELECT linked.account_id, saved_signal.id
      FROM saved_signal
      CROSS JOIN unnest($12::text[]) AS linked(account_id)
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
        [...signal.linkedAccountIds],
      ],
    );
  }

  async deleteAll(): Promise<void> {
    await this.pool.query("DELETE FROM signals");
  }
}
