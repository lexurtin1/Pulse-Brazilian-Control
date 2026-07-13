import type { DealDto } from "./DealDto.js";

export interface PipelineCsvRowErrorDto {
  rowNumber: number;
  errors: string[];
}

export interface ImportPipelineCsvResultDto {
  sourceDocumentId: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: PipelineCsvRowErrorDto[];
  reviewRequiredCount: number;
  deals: DealDto[];
}
