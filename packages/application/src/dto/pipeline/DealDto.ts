export interface DealDto {
  id: string;
  sourceDocumentId: string;
  sourceRowNumber: number;
  opportunityOwner?: string;
  accountNameRaw: string;
  opportunityName: string;
  stage: string;
  fiscalPeriod: string;
  amount: number;
  expectedRevenue: number;
  probabilityPercent: number;
  ageDays?: number;
  revenueLiveDate?: string;
  nextStepSummary?: string;
  leadSource?: string;
  type?: string;
  ownerRegion?: string;
  linkedAccountId?: string;
  reviewStatus: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}
