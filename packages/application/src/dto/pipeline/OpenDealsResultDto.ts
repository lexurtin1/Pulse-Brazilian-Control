import type { DealDto } from "./DealDto.js";

export interface OpenDealsResultDto {
  asOf: string;
  /** Every open deal (Live/Lost excluded) from the latest pipeline upload, ranked by Amount descending. */
  deals: DealDto[];
  /** Totals over the whole list, so the card's header doesn't have to re-derive them from `deals`. */
  dealCount: number;
  totalValue: number;
}
