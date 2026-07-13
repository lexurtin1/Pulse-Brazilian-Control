import type { DealDto } from "./DealDto.js";

export interface TopOpenDealsResultDto {
  asOf: string;
  /** Top open deals (Live/Lost excluded) ranked by Amount descending, capped at 4. */
  deals: DealDto[];
}
