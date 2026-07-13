import type { IInsightRepository } from "@pulse-brazil/application";
import { toEvidenceReference, toRelatedEntityReference } from "@pulse-brazil/application";
import {
  type AccountId,
  asContextBundleId,
  asInsightId,
  asPromptProfileId,
  ConfidenceScore,
  Insight,
  type InsightId,
  InsightOrigin,
  InsightOriginKind,
  PromptProfile,
  RecommendedAction,
  RelatedEntityKind,
} from "@pulse-brazil/domain";
import type { Pool } from "@neondatabase/serverless";

interface EvidenceReferenceJson {
  kind: string;
  referenceId: string | null;
  excerpt: string | null;
  locator: string | null;
}

interface RelatedEntityJson {
  kind: string;
  id: string;
}

interface PromptProfileJson {
  id: string;
  name: string;
  version: string;
  purpose: string;
}

interface OriginJson {
  kind: string;
  promptProfile: PromptProfileJson | null;
  contextBundleId: string | null;
}

interface RecommendedActionJson {
  description: string;
  dueDate: string | null;
}

interface InsightRow {
  id: string;
  summary: string;
  why_it_matters: string;
  related_entities: RelatedEntityJson[];
  evidence: EvidenceReferenceJson[];
  confidence: string;
  origin: OriginJson;
  generated_at: Date;
  recommended_action: RecommendedActionJson | null;
}

function originFromJson(json: OriginJson): InsightOrigin {
  return InsightOrigin.of({
    kind: json.kind as InsightOriginKind,
    promptProfile: json.promptProfile
      ? PromptProfile.of({
          id: asPromptProfileId(json.promptProfile.id),
          name: json.promptProfile.name,
          version: json.promptProfile.version,
          purpose: json.promptProfile.purpose,
        })
      : undefined,
    contextBundleId: json.contextBundleId ? asContextBundleId(json.contextBundleId) : undefined,
  });
}

function originToJson(origin: InsightOrigin): OriginJson {
  return {
    kind: origin.kind,
    promptProfile: origin.promptProfile
      ? {
          id: origin.promptProfile.id,
          name: origin.promptProfile.name,
          version: origin.promptProfile.version,
          purpose: origin.promptProfile.purpose,
        }
      : null,
    contextBundleId: origin.contextBundleId ?? null,
  };
}

function evidenceReferenceToJson(evidence: { kind: string; referenceId?: string; excerpt?: string; locator?: string }): EvidenceReferenceJson {
  return {
    kind: evidence.kind,
    referenceId: evidence.referenceId ?? null,
    excerpt: evidence.excerpt ?? null,
    locator: evidence.locator ?? null,
  };
}

/** Extracted at save time so findByAccountId/findLatestForAccount can use a plain indexed column instead of a JSONB containment scan over related_entities. */
function extractPrimaryAccountId(insight: Insight): string | null {
  const accountEntity = insight.relatedEntities.find((entity) => entity.kind === RelatedEntityKind.Account);
  return accountEntity?.id ?? null;
}

function rowToInsight(row: InsightRow): Insight {
  try {
    return Insight.of({
      id: asInsightId(row.id),
      summary: row.summary,
      whyItMatters: row.why_it_matters,
      relatedEntities: row.related_entities.map(toRelatedEntityReference),
      evidence: row.evidence.map((json) =>
        toEvidenceReference({ kind: json.kind, referenceId: json.referenceId ?? undefined, excerpt: json.excerpt ?? undefined, locator: json.locator ?? undefined }),
      ),
      confidence: ConfidenceScore.of(Number(row.confidence)),
      origin: originFromJson(row.origin),
      generatedAt: row.generated_at,
      recommendedAction: row.recommended_action
        ? RecommendedAction.of({
            description: row.recommended_action.description,
            dueDate: row.recommended_action.dueDate ? new Date(row.recommended_action.dueDate) : undefined,
          })
        : undefined,
    });
  } catch (error) {
    throw new Error(`Failed to reconstruct Insight ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Satisfies IInsightRepository. No ORM — plain parameterised SQL against the insights table (see migrations/007_create_insights.sql). */
export class PostgresInsightRepository implements IInsightRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: InsightId): Promise<Insight | null> {
    const { rows } = await this.pool.query<InsightRow>("SELECT * FROM insights WHERE id = $1", [id]);
    const [row] = rows;
    return row ? rowToInsight(row) : null;
  }

  async findByAccountId(accountId: AccountId): Promise<Insight[]> {
    const { rows } = await this.pool.query<InsightRow>(
      "SELECT * FROM insights WHERE primary_account_id = $1 ORDER BY generated_at DESC",
      [accountId],
    );
    return rows.map(rowToInsight);
  }

  async findLatestForAccount(accountId: AccountId): Promise<Insight | null> {
    const { rows } = await this.pool.query<InsightRow>(
      "SELECT * FROM insights WHERE primary_account_id = $1 ORDER BY generated_at DESC LIMIT 1",
      [accountId],
    );
    const [row] = rows;
    return row ? rowToInsight(row) : null;
  }

  async save(insight: Insight): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO insights (
        id, summary, why_it_matters, related_entities, evidence, confidence,
        origin, generated_at, recommended_action, primary_account_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        summary = EXCLUDED.summary,
        why_it_matters = EXCLUDED.why_it_matters,
        related_entities = EXCLUDED.related_entities,
        evidence = EXCLUDED.evidence,
        confidence = EXCLUDED.confidence,
        origin = EXCLUDED.origin,
        generated_at = EXCLUDED.generated_at,
        recommended_action = EXCLUDED.recommended_action,
        primary_account_id = EXCLUDED.primary_account_id
      `,
      [
        insight.id,
        insight.summary,
        insight.whyItMatters,
        JSON.stringify(insight.relatedEntities.map((entity) => ({ kind: entity.kind, id: entity.id }))),
        JSON.stringify(insight.evidence.map(evidenceReferenceToJson)),
        insight.confidence.toNumber(),
        JSON.stringify(originToJson(insight.origin)),
        insight.generatedAt,
        insight.recommendedAction
          ? JSON.stringify({ description: insight.recommendedAction.description, dueDate: insight.recommendedAction.dueDate?.toISOString() ?? null })
          : null,
        extractPrimaryAccountId(insight),
      ],
    );
  }
}
