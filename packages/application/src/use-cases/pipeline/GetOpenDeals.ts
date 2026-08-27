import { DocumentType } from "@pulse-brazil/domain";
import type { OpenDealsResultDto } from "../../dto/pipeline/OpenDealsResultDto.js";
import type { IDealRepository } from "../../ports/IDealRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import { toDealDto } from "./ImportPipelineCsv.js";

/**
 * Every open deal (Live/Lost excluded) from the latest Pipeline CSV upload,
 * ranked by Amount descending — biggest in the funnel first, not
 * risk-adjusted. Deliberately uncapped: the card scrolls, and a cap here
 * would silently hide deals from the only view that lists them.
 */
export class GetOpenDeals {
  constructor(
    private readonly deals: IDealRepository,
    private readonly documents: IDocumentRepository,
  ) {}

  async execute(): Promise<OpenDealsResultDto | null> {
    const [latest] = await this.documents.findByDeclaredType(DocumentType.PipelineDataset);
    if (!latest) return null;

    const deals = await this.deals.findBySourceDocumentId(latest.id);
    const openDeals = deals
      .filter((deal) => deal.isOpen)
      .sort((a, b) => b.amount - a.amount)
      .map(toDealDto);

    return {
      asOf: latest.provenance.uploadedAt.toISOString(),
      deals: openDeals,
      dealCount: openDeals.length,
      totalValue: openDeals.reduce((total, deal) => total + deal.amount, 0),
    };
  }
}
