import { DocumentType } from "@pulse-brazil/domain";
import type { TopOpenDealsResultDto } from "../../dto/pipeline/TopOpenDealsResultDto.js";
import type { IDealRepository } from "../../ports/IDealRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import { toDealDto } from "./ImportPipelineCsv.js";

const TOP_OPEN_DEALS_LIMIT = 4;

/** Top 4 open deals (Live/Lost excluded) from the latest Pipeline CSV upload, ranked by Amount descending — biggest in the funnel, not risk-adjusted. */
export class GetTopOpenDeals {
  constructor(
    private readonly deals: IDealRepository,
    private readonly documents: IDocumentRepository,
  ) {}

  async execute(): Promise<TopOpenDealsResultDto | null> {
    const [latest] = await this.documents.findByDeclaredType(DocumentType.PipelineDataset);
    if (!latest) return null;

    const deals = await this.deals.findBySourceDocumentId(latest.id);
    const topDeals = deals
      .filter((deal) => deal.isOpen)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, TOP_OPEN_DEALS_LIMIT)
      .map(toDealDto);

    return { asOf: latest.provenance.uploadedAt.toISOString(), deals: topDeals };
  }
}
