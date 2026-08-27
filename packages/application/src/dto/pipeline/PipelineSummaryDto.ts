/** Absent entirely on the very first upload — there is no previous snapshot to compare against, and a fabricated "vs. 0" delta would be misleading. */
export interface PipelineValueDeltaDto {
  amount: number;
  previousAsOf: string;
}

/** One open stage's share of the unweighted total. Always all four open stages, in funnel order (OPEN_DEAL_STAGE_ORDER), including any sitting at zero — an empty stage is a real thing to know about a funnel, and a card whose row count changed with the data would resize itself on every upload. */
export interface PipelineStageSliceDto {
  stage: string;
  value: number;
  dealCount: number;
}

export interface PipelineSummaryDto {
  sourceDocumentId: string;
  asOf: string;
  openDealCount: number;
  /** Sum of Amount across open deals (Discovery/Prospect/Qualified/Signed) — the "Pipeline Value - Unweighted" card. */
  unweightedValue: number;
  unweightedDelta?: PipelineValueDeltaDto;
  /** Sum of Expected Revenue across open deals — the "Pipeline Value - Weighted" card. */
  weightedValue: number;
  weightedDelta?: PipelineValueDeltaDto;
  /** unweightedValue split by stage, funnel order. Sums to unweightedValue by construction — the card draws it as one bar the width of the headline figure. */
  stages: PipelineStageSliceDto[];
}
