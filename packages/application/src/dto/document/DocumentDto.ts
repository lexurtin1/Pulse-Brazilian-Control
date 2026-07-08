export interface DocumentProvenanceDto {
  connectorSource: string;
  uploadedAt: string;
  uploadedBy?: string;
  originalFilename?: string;
}

/** Serialisable projection of a SourceDocument. `hasClassificationConflict` is surfaced explicitly so presentation never has to re-derive it. */
export interface DocumentDto {
  id: string;
  declaredType: string;
  inferredType?: string;
  hasClassificationConflict: boolean;
  linkedAccountId?: string;
  linkedThemeIds: string[];
  ingestionState: string;
  provenance: DocumentProvenanceDto;
  extractedReferenceIds: string[];
}
