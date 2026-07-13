/** Absent entirely on the very first upload — there is no previous snapshot to compare against, and a fabricated "vs. 0" delta would be misleading. */
export interface PipelineValueDeltaDto {
  amount: number;
  previousAsOf: string;
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
}
