import { DocumentType, OPEN_DEAL_STAGE_ORDER, type Deal } from "@pulse-brazil/domain";
import type { PipelineStageSliceDto, PipelineSummaryDto, PipelineValueDeltaDto } from "../../dto/pipeline/PipelineSummaryDto.js";
import type { IDealRepository } from "../../ports/IDealRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";

function sumOpenDeals(deals: Deal[]): { unweighted: number; weighted: number; count: number } {
  const openDeals = deals.filter((deal) => deal.isOpen);
  return {
    unweighted: openDeals.reduce((sum, deal) => sum + deal.amount, 0),
    weighted: openDeals.reduce((sum, deal) => sum + deal.expectedRevenue, 0),
    count: openDeals.length,
  };
}

/**
 * Where the open pipeline is sitting in the funnel. Driven off
 * OPEN_DEAL_STAGE_ORDER rather than off whatever stages happen to appear in
 * this upload, so the four slices are always present and always in the same
 * order — a stage that emptied since the last export reads as an empty
 * stage rather than silently disappearing from the card.
 */
function stageBreakdown(deals: Deal[]): PipelineStageSliceDto[] {
  const openDeals = deals.filter((deal) => deal.isOpen);
  return OPEN_DEAL_STAGE_ORDER.map((stage) => {
    const inStage = openDeals.filter((deal) => deal.stage === stage);
    return {
      stage,
      value: inStage.reduce((sum, deal) => sum + deal.amount, 0),
      dealCount: inStage.length,
    };
  });
}

/**
 * Reads the latest Pipeline CSV upload (the most recently uploaded
 * SourceDocument of declaredType PipelineDataset — there is no separate
 * "snapshot" entity, see claude/INTEGRATION_PLAN.md Feature 1) and sums its
 * open deals (Live/Lost excluded) two ways: unweighted (Amount) and
 * weighted (Expected Revenue). Delta fields are omitted entirely when there
 * is no previous upload to compare against — never fabricated as "vs. 0".
 */
export class GetPipelineSummary {
  constructor(
    private readonly deals: IDealRepository,
    private readonly documents: IDocumentRepository,
  ) {}

  async execute(): Promise<PipelineSummaryDto | null> {
    const snapshots = await this.documents.findByDeclaredType(DocumentType.PipelineDataset);
    const [latest, previous] = snapshots;
    if (!latest) return null;

    const latestDeals = await this.deals.findBySourceDocumentId(latest.id);
    const totals = sumOpenDeals(latestDeals);

    let unweightedDelta: PipelineValueDeltaDto | undefined;
    let weightedDelta: PipelineValueDeltaDto | undefined;
    if (previous) {
      const previousDeals = await this.deals.findBySourceDocumentId(previous.id);
      const previousTotals = sumOpenDeals(previousDeals);
      const previousAsOf = previous.provenance.uploadedAt.toISOString();
      unweightedDelta = { amount: totals.unweighted - previousTotals.unweighted, previousAsOf };
      weightedDelta = { amount: totals.weighted - previousTotals.weighted, previousAsOf };
    }

    return {
      sourceDocumentId: latest.id,
      asOf: latest.provenance.uploadedAt.toISOString(),
      openDealCount: totals.count,
      unweightedValue: totals.unweighted,
      unweightedDelta,
      weightedValue: totals.weighted,
      weightedDelta,
      stages: stageBreakdown(latestDeals),
    };
  }
}
