import type { IContextBundleRepository } from "@pulse-brazil/application";
import { toEvidenceReference } from "@pulse-brazil/application";
import { asAccountId, asContextBundleId, ContextBundle, type ContextBundleId } from "@pulse-brazil/domain";
import type { Pool } from "pg";

interface EvidenceReferenceJson {
  kind: string;
  referenceId: string | null;
  excerpt: string | null;
  locator: string | null;
}

interface ContextBundleData {
  assembledAt: string;
  evidence: EvidenceReferenceJson[];
  subjectAccountId: string | null;
}

interface ContextBundleRow {
  id: string;
  data: ContextBundleData;
}

function evidenceReferenceToJson(evidence: { kind: string; referenceId?: string; excerpt?: string; locator?: string }): EvidenceReferenceJson {
  return {
    kind: evidence.kind,
    referenceId: evidence.referenceId ?? null,
    excerpt: evidence.excerpt ?? null,
    locator: evidence.locator ?? null,
  };
}

function rowToContextBundle(row: ContextBundleRow): ContextBundle {
  try {
    return ContextBundle.of({
      id: asContextBundleId(row.id),
      assembledAt: new Date(row.data.assembledAt),
      evidence: row.data.evidence.map((json) =>
        toEvidenceReference({ kind: json.kind, referenceId: json.referenceId ?? undefined, excerpt: json.excerpt ?? undefined, locator: json.locator ?? undefined }),
      ),
      subjectAccountId: row.data.subjectAccountId ? asAccountId(row.data.subjectAccountId) : undefined,
    });
  } catch (error) {
    throw new Error(`Failed to reconstruct ContextBundle ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Satisfies IContextBundleRepository. ContextBundle is a value-heavy read model, so it's stored as a single JSONB column rather than normalized ones (see migrations/006_create_context_bundles.sql). */
export class PostgresContextBundleRepository implements IContextBundleRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: ContextBundleId): Promise<ContextBundle | null> {
    const { rows } = await this.pool.query<ContextBundleRow>("SELECT * FROM context_bundles WHERE id = $1", [id]);
    const [row] = rows;
    return row ? rowToContextBundle(row) : null;
  }

  async save(bundle: ContextBundle): Promise<void> {
    const data: ContextBundleData = {
      assembledAt: bundle.assembledAt.toISOString(),
      evidence: bundle.evidence.map(evidenceReferenceToJson),
      subjectAccountId: bundle.subjectAccountId ?? null,
    };
    await this.pool.query(
      `
      INSERT INTO context_bundles (id, data)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
      `,
      [bundle.id, JSON.stringify(data)],
    );
  }
}
