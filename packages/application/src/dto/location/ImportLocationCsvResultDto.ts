import type { LocationRecordDto } from "./LocationRecordDto.js";

export interface LocationCsvRowErrorDto {
  rowNumber: number;
  errors: string[];
}

export interface ImportLocationCsvResultDto {
  sourceDocumentId: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: LocationCsvRowErrorDto[];
  reviewRequiredCount: number;
  records: LocationRecordDto[];
}
