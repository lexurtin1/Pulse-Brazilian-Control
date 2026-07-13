import type { IDealRepository } from "@pulse-brazil/application";
import {
  asAccountId,
  asDealId,
  asDocumentId,
  Deal,
  type DealProps,
  DealReviewStatus,
  DealStage,
  type DocumentId,
} from "@pulse-brazil/domain";
import type { Pool } from "@neondatabase/serverless";

interface DealRow {
  id: string;
  source_document_id: string;
  source_row_number: number;
  opportunity_owner: string | null;
  account_name_raw: string;
  opportunity_name: string;
  stage: string;
  fiscal_period: string;
  amount: string;
  expected_revenue: string;
  probability_percent: string;
  age_days: number | null;
  revenue_live_date: string | Date | null;
  next_step_summary: string | null;
  lead_source: string | null;
  type: string | null;
  owner_region: string | null;
  linked_account_id: string | null;
  review_status: string;
  review_notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function rowToDeal(row: DealRow): Deal {
  const props: DealProps = {
    id: asDealId(row.id),
    sourceDocumentId: asDocumentId(row.source_document_id),
    sourceRowNumber: row.source_row_number,
    opportunityOwner: row.opportunity_owner ?? undefined,
    accountNameRaw: row.account_name_raw,
    opportunityName: row.opportunity_name,
    stage: row.stage as DealStage,
    fiscalPeriod: row.fiscal_period,
    amount: Number(row.amount),
    expectedRevenue: Number(row.expected_revenue),
    probabilityPercent: Number(row.probability_percent),
    ageDays: row.age_days ?? undefined,
    revenueLiveDate: row.revenue_live_date ? new Date(row.revenue_live_date) : undefined,
    nextStepSummary: row.next_step_summary ?? undefined,
    leadSource: row.lead_source ?? undefined,
    type: row.type ?? undefined,
    ownerRegion: row.owner_region ?? undefined,
    linkedAccountId: row.linked_account_id ? asAccountId(row.linked_account_id) : undefined,
    reviewStatus: row.review_status as DealReviewStatus,
    reviewNotes: row.review_notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
  return Deal.reconstruct(props);
}

/** Satisfies IDealRepository. No ORM — plain parameterised SQL against the deals table (see migrations/013_create_deals.sql). */
export class PostgresDealRepository implements IDealRepository {
  constructor(private readonly pool: Pool) {}

  async findBySourceDocumentId(sourceDocumentId: DocumentId): Promise<Deal[]> {
    const { rows } = await this.pool.query<DealRow>(
      "SELECT * FROM deals WHERE source_document_id = $1 ORDER BY source_row_number ASC",
      [sourceDocumentId],
    );
    return rows.map(rowToDeal);
  }

  /** One CSV upload's deals are a single known batch — inserted inside one transaction so a mid-batch failure can't leave a snapshot half-written. */
  async saveMany(deals: Deal[]): Promise<void> {
    if (deals.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const deal of deals) {
        await client.query(
          `
          INSERT INTO deals (
            id, source_document_id, source_row_number,
            opportunity_owner, account_name_raw, opportunity_name,
            stage, fiscal_period, amount, expected_revenue, probability_percent,
            age_days, revenue_live_date, next_step_summary, lead_source, type, owner_region,
            linked_account_id, review_status, review_notes,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3,
            $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17,
            $18, $19, $20,
            $21, $22
          )
          ON CONFLICT (id) DO UPDATE SET
            stage = EXCLUDED.stage,
            amount = EXCLUDED.amount,
            expected_revenue = EXCLUDED.expected_revenue,
            probability_percent = EXCLUDED.probability_percent,
            linked_account_id = EXCLUDED.linked_account_id,
            review_status = EXCLUDED.review_status,
            review_notes = EXCLUDED.review_notes,
            updated_at = EXCLUDED.updated_at
          `,
          [
            deal.id,
            deal.sourceDocumentId,
            deal.sourceRowNumber,
            deal.opportunityOwner ?? null,
            deal.accountNameRaw,
            deal.opportunityName,
            deal.stage,
            deal.fiscalPeriod,
            deal.amount,
            deal.expectedRevenue,
            deal.probabilityPercent,
            deal.ageDays ?? null,
            deal.revenueLiveDate ?? null,
            deal.nextStepSummary ?? null,
            deal.leadSource ?? null,
            deal.type ?? null,
            deal.ownerRegion ?? null,
            deal.linkedAccountId ?? null,
            deal.reviewStatus,
            deal.reviewNotes ?? null,
            deal.createdAt,
            deal.updatedAt,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
