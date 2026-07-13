import type { ITemperatureAssessmentRepository } from "@pulse-brazil/application";
import { toEvidenceReference } from "@pulse-brazil/application";
import {
  type AccountId,
  asAccountId,
  asTemperatureAssessmentId,
  ConfidenceScore,
  TemperatureAssessment,
  type TemperatureBand,
} from "@pulse-brazil/domain";
import type { Pool } from "@neondatabase/serverless";

interface EvidenceReferenceJson {
  kind: string;
  referenceId: string | null;
  excerpt: string | null;
  locator: string | null;
}

interface TemperatureAssessmentRow {
  id: string;
  account_id: string;
  band: string;
  rationale: string;
  evidence: EvidenceReferenceJson[];
  assessed_at: Date;
  assessed_by: string;
  confidence: string;
  next_action: string | null;
}

function evidenceReferenceToJson(evidence: { kind: string; referenceId?: string; excerpt?: string; locator?: string }): EvidenceReferenceJson {
  return {
    kind: evidence.kind,
    referenceId: evidence.referenceId ?? null,
    excerpt: evidence.excerpt ?? null,
    locator: evidence.locator ?? null,
  };
}

function rowToTemperatureAssessment(row: TemperatureAssessmentRow): TemperatureAssessment {
  try {
    return TemperatureAssessment.of({
      id: asTemperatureAssessmentId(row.id),
      accountId: asAccountId(row.account_id),
      band: row.band as TemperatureBand,
      rationale: row.rationale,
      evidence: row.evidence.map((json) =>
        toEvidenceReference({ kind: json.kind, referenceId: json.referenceId ?? undefined, excerpt: json.excerpt ?? undefined, locator: json.locator ?? undefined }),
      ),
      assessedAt: row.assessed_at,
      assessedBy: row.assessed_by,
      confidence: ConfidenceScore.of(Number(row.confidence)),
      nextAction: row.next_action ?? undefined,
    });
  } catch (error) {
    throw new Error(`Failed to reconstruct TemperatureAssessment ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Satisfies ITemperatureAssessmentRepository. Append-only — save() always inserts a new row (matches the domain: assessments are immutable). No ORM (see migrations/008_create_temperature_assessments.sql). */
export class PostgresTemperatureAssessmentRepository implements ITemperatureAssessmentRepository {
  constructor(private readonly pool: Pool) {}

  async findLatestForAccount(accountId: AccountId): Promise<TemperatureAssessment | null> {
    const { rows } = await this.pool.query<TemperatureAssessmentRow>(
      "SELECT * FROM temperature_assessments WHERE account_id = $1 ORDER BY assessed_at DESC LIMIT 1",
      [accountId],
    );
    const [row] = rows;
    return row ? rowToTemperatureAssessment(row) : null;
  }

  async findHistoryForAccount(accountId: AccountId): Promise<TemperatureAssessment[]> {
    const { rows } = await this.pool.query<TemperatureAssessmentRow>(
      "SELECT * FROM temperature_assessments WHERE account_id = $1 ORDER BY assessed_at DESC",
      [accountId],
    );
    return rows.map(rowToTemperatureAssessment);
  }

  async save(assessment: TemperatureAssessment): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO temperature_assessments (
        id, account_id, band, rationale, evidence, assessed_at, assessed_by, confidence, next_action
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        assessment.id,
        assessment.accountId,
        assessment.band,
        assessment.rationale,
        JSON.stringify(assessment.evidence.map(evidenceReferenceToJson)),
        assessment.assessedAt,
        assessment.assessedBy,
        assessment.confidence.toNumber(),
        assessment.nextAction ?? null,
      ],
    );
  }
}
